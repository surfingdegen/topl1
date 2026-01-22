import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, LogOut, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { ethers } from 'ethers';
import CoinbaseWalletSDK from '@coinbase/wallet-sdk';

const CONTRACT_ADDRESS = '0x350386d7FB4d9F230ce52eEE794ddc5392777048';
const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_ID_HEX = '0x2105';

const CONTRACT_ABI = [
  "function deposit(uint256 usdcAmount) external",
  "function withdraw() external",
  "function getUserBalances(address user) external view returns (uint256, uint256, uint256, uint256, uint256)",
  "event Deposited(address indexed user, uint256 usdcAmount)",
  "event Withdrawn(address indexed user, uint256 usdcAmount)"
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const ASSETS = [
  { name: 'Ethereum', symbol: 'WETH', decimals: 18 },
  { name: 'Solana', symbol: 'SOL', decimals: 9 },
  { name: 'XRP', symbol: 'cbXRP', decimals: 18 },
  { name: 'Litecoin', symbol: 'cbLTC', decimals: 8 },
  { name: 'Cardano', symbol: 'cbADA', decimals: 18 }
];

function App() {
  const [sdk, setSdk] = useState(null);
  const [provider, setProvider] = useState(null);
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [activeTab, setActiveTab] = useState('deposit');
  const [usdcAmount, setUsdcAmount] = useState('');
  const [balances, setBalances] = useState([0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState('0');

  useEffect(() => {
    const coinbaseWallet = new CoinbaseWalletSDK({
      appName: 'TopL1',
      darkMode: true
    });

    const walletProvider = coinbaseWallet.makeWeb3Provider();

    setSdk(coinbaseWallet);
    setProvider(walletProvider);

    walletProvider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        setAccount(accounts[0]);
      }
    });

    walletProvider.on('chainChanged', (chainId) => {
      if (parseInt(chainId) !== BASE_CHAIN_ID) {
        setError('Please switch to Base network');
      } else {
        setError('');
      }
    });

    return () => {
      if (walletProvider) {
        walletProvider.removeAllListeners();
      }
    };
  }, []);

  useEffect(() => {
    if (account && signer) {
      loadBalances();
      checkApproval();
      loadUSDCBalance();
    }
  }, [account, signer]);

  const connectWallet = async () => {
    try {
      setError('');
      setLoading(true);

      if (!provider) {
        setError('Wallet provider not initialized');
        return;
      }

      const accounts = await provider.request({
        method: 'eth_requestAccounts'
      });

      if (!accounts || accounts.length === 0) {
        setError('No accounts found. Please unlock your Coinbase Wallet.');
        return;
      }

      const chainId = await provider.request({ method: 'eth_chainId' });
      
      if (chainId !== BASE_CHAIN_ID_HEX) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_CHAIN_ID_HEX }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: BASE_CHAIN_ID_HEX,
                chainName: 'Base',
                nativeCurrency: {
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18
                },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org']
              }]
            });
          } else {
            throw switchError;
          }
        }
      }

      const ethersProvider = new ethers.BrowserProvider(provider);
      const ethersSigner = await ethersProvider.getSigner();

      setAccount(accounts[0]);
      setSigner(ethersSigner);
      setSuccess('Wallet connected successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Connection error:', err);
      if (err.code === 4001) {
        setError('Connection rejected by user');
      } else {
        setError('Failed to connect: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const disconnectWallet = () => {
    if (provider) {
      provider.disconnect();
    }
    setAccount(null);
    setSigner(null);
    setBalances([0, 0, 0, 0, 0]);
    setIsApproved(false);
    setUsdcAmount('');
    setUsdcBalance('0');
    setSuccess('Wallet disconnected');
    setTimeout(() => setSuccess(''), 3000);
  };

  const loadUSDCBalance = async () => {
    if (!signer || !account) return;
    
    try {
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const balance = await usdcContract.balanceOf(account);
      setUsdcBalance(ethers.formatUnits(balance, 6));
    } catch (err) {
      console.error('Error loading USDC balance:', err);
    }
  };

  const loadBalances = async () => {
    if (!signer || !account) return;
    
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const result = await contract.getUserBalances(account);
      const formattedBalances = ASSETS.map((asset, idx) => 
        parseFloat(ethers.formatUnits(result[idx], asset.decimals))
      );
      setBalances(formattedBalances);
    } catch (err) {
      console.error('Error loading balances:', err);
    }
  };

  const checkApproval = async () => {
    if (!signer || !account) return;
    
    try {
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const allowance = await usdcContract.allowance(account, CONTRACT_ADDRESS);
      setIsApproved(allowance > 0);
    } catch (err) {
      console.error('Error checking approval:', err);
    }
  };

  const approveUSDC = async () => {
    if (!signer) return;
    
    setLoading(true);
    setError('');
    
    try {
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const tx = await usdcContract.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
      setSuccess('Approval transaction submitted... Please wait.');
      await tx.wait();
      setIsApproved(true);
      setSuccess('USDC approved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Approval error:', err);
      if (err.code === 4001) {
        setError('Approval rejected by user');
      } else {
        setError('Approval failed: ' + (err.shortMessage || err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!signer || !usdcAmount) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const amount = ethers.parseUnits(usdcAmount, 6);
      const tx = await contract.deposit(amount);
      setSuccess('Deposit transaction submitted... Please wait.');
      await tx.wait();
      setSuccess('Deposit successful! Your USDC has been diversified.');
      setUsdcAmount('');
      await loadBalances();
      await loadUSDCBalance();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Deposit error:', err);
      if (err.code === 4001) {
        setError('Deposit rejected by user');
      } else {
        setError('Deposit failed: ' + (err.shortMessage || err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!signer) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.withdraw();
      setSuccess('Withdrawal transaction submitted... Please wait.');
      await tx.wait();
      setSuccess('Withdrawal successful! All tokens converted back to USDC.');
      await loadBalances();
      await loadUSDCBalance();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Withdrawal error:', err);
      if (err.code === 4001) {
        setError('Withdrawal rejected by user');
      } else if (err.message && err.message.includes('execution reverted')) {
        setError('Withdrawal failed: Likely reasons: 1) Amounts too small to swap (need minimum liquidity) 2) DEX pools lack liquidity. Consider depositing more first.');
      } else {
        setError('Withdrawal failed: ' + (err.shortMessage || err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateSplit = () => {
    if (!usdcAmount) return [];
    const amount = parseFloat(usdcAmount);
    const portion = amount * 0.2;
    return ASSETS.map(asset => ({ ...asset, amount: portion }));
  };

  if (!account) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full">
          <div className="backdrop-blur-xl bg-white/10 rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-white/20">
            <div className="flex justify-center mb-4 sm:mb-6">
              <Wallet className="w-12 h-12 sm:w-16 sm:h-16 text-blue-400" />
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-bold text-blue-400 text-center mb-2 sm:mb-3">TopL1</h1>
            <p className="text-gray-400 text-center mb-6 sm:mb-8 text-sm sm:text-base">Auto-diversify into 5 top Layer 1 tokens</p>

            <button
              onClick={connectWallet}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold py-3 sm:py-4 px-6 rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 text-sm sm:text-base active:scale-95"
            >
              {loading ? 'Connecting...' : 'Connect Coinbase Wallet'}
            </button>

            <div className="flex justify-center gap-4 mt-4 sm:mt-6">
              <a 
                href="https://github.com/surfingdegen/topl1" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 text-sm hover:underline"
              >
                Learn
              </a>
              <span className="text-gray-600">•</span>
              <a 
                href="https://basescan.org/address/0x350386d7FB4d9F230ce52eEE794ddc5392777048" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 text-sm hover:underline"
              >
                Tip-Dev
              </a>
            </div>

            <p className="text-xs text-gray-500 text-center mt-4">
              Make sure MetaMask is disabled if you have it installed
            </p>

            {error && (
              <div className="mt-3 sm:mt-4 bg-red-500/20 border border-red-500/50 text-red-200 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="text-center mt-4 sm:mt-6 text-xs sm:text-sm text-gray-500 px-4">
            Powered by Aerodrome on Base • Immutable Smart{' '}
            <a 
              href={`https://basescan.org/address/${CONTRACT_ADDRESS}#code`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Contract
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-3 sm:p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-8 gap-3 sm:gap-0">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-blue-400">TopL1</h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-1">Auto-diversify into 5 top Layer 1 tokens</p>
            <p className="text-gray-500 text-xs mt-1">USDC Balance: {parseFloat(usdcBalance).toFixed(2)}</p>
          </div>
          <button
            onClick={disconnectWallet}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 sm:px-4 py-2 rounded-xl transition-all backdrop-blur-sm text-sm active:scale-95"
          >
            <span className="text-xs sm:text-sm">{account.slice(0, 6)}...{account.slice(-4)}</span>
            <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
          </button>
        </div>

        {(error || success) && (
          <div className={`mb-4 sm:mb-6 ${success ? 'bg-green-500/20 border-green-500/50 text-green-200' : 'bg-red-500/20 border-red-500/50 text-red-200'} border px-3 sm:px-4 py-2 sm:py-3 rounded-lg flex items-start gap-2 text-xs sm:text-sm`}>
            {success ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" />}
            <span>{error || success}</span>
          </div>
        )}

        <div className="backdrop-blur-xl bg-white/10 rounded-2xl sm:rounded-3xl border border-white/20 overflow-hidden">
          <div className="flex border-b border-white/20">
            <button
              onClick={() => setActiveTab('deposit')}
              className={`flex-1 py-3 sm:py-4 px-4 sm:px-6 font-semibold transition-all text-sm sm:text-base ${
                activeTab === 'deposit'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Deposit
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={`flex-1 py-3 sm:py-4 px-4 sm:px-6 font-semibold transition-all text-sm sm:text-base ${
                activeTab === 'withdraw'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Withdraw
            </button>
          </div>

          <div className="p-4 sm:p-6">
            {activeTab === 'deposit' ? (
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <label className="block text-gray-400 text-xs sm:text-sm mb-2">Amount (USDC)</label>
                  <input
                    type="number"
                    value={usdcAmount}
                    onChange={(e) => setUsdcAmount(e.target.value)}
                    placeholder="Enter USDC amount (min 10)"
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                  />
                </div>

                {usdcAmount && parseFloat(usdcAmount) >= 10 && (
                  <div className="bg-white/5 rounded-xl p-3 sm:p-4">
                    <p className="text-gray-400 text-xs sm:text-sm mb-2 sm:mb-3">You will receive (20% each):</p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {calculateSplit().map((asset, idx) => (
                        <div key={idx} className="bg-white/5 rounded-lg p-2 text-center">
                          <div className="text-white font-semibold text-xs sm:text-sm">{asset.symbol}</div>
                          <div className="text-gray-500 text-xs">${asset.amount.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isApproved ? (
                  <button
                    onClick={approveUSDC}
                    disabled={loading}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 sm:py-4 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base active:scale-95"
                  >
                    {loading ? 'Approving...' : 'Approve USDC'}
                  </button>
                ) : (
                  <button
                    onClick={handleDeposit}
                    disabled={loading || !usdcAmount || parseFloat(usdcAmount) < 10}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-3 sm:py-4 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base active:scale-95"
                  >
                    {loading ? 'Processing...' : 'Deposit & Diversify'}
                    {!loading && <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                <div className="space-y-2 sm:space-y-3">
                  {ASSETS.map((asset, idx) => (
                    <div key={idx} className="bg-white/5 rounded-xl p-3 sm:p-4 flex justify-between items-center">
                      <div>
                        <div className="text-white font-semibold text-sm sm:text-base">{asset.symbol}</div>
                        <div className="text-gray-500 text-xs">{asset.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold text-sm sm:text-base">{balances[idx].toFixed(asset.decimals === 8 ? 8 : 6)}</div>
                        <div className="text-gray-500 text-xs">{asset.symbol}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleWithdraw}
                  disabled={loading || balances.every(b => b === 0)}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 sm:py-4 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base active:scale-95"
                >
                  {loading ? 'Processing...' : 'Withdraw All to USDC'}
                  {!loading && <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
                
                {balances.some(b => b > 0) && balances[0] < 0.001 && (
                  <p className="text-xs text-yellow-400 text-center">
                    ⚠️ Withdrawal may be less than deposit due to transaction fees and asset volatility.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
