import { useState, useEffect, useCallback } from 'react';

function App() {
  const [key, setKey] = useState('');
  const [digits, setDigits] = useState(6);
  const [period, setPeriod] = useState(30);
  const [algorithm, setAlgorithm] = useState('SHA-1');
  const [otp, setOtp] = useState('----');
  const [remaining, setRemaining] = useState(30);
  const [copyIcon, setCopyIcon] = useState('📋');

  const generateRandomKey = () => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let key = '';
    for (let i = 0; i < 16; i++) {
      key += charset[Math.floor(Math.random() * charset.length)];
    }
    return key;
  };

  const generateOTP = useCallback(async () => {
    if (!key) {
      alert('Please enter a valid TOTP key.');
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_OPTIONAL_BACKEND_URL || '';
      const baseUrl = backendUrl ? backendUrl : '';
      const response = await fetch(
        `${baseUrl}/generate-totp?key=${encodeURIComponent(key)}&digits=${digits}&period=${period}&algorithm=${algorithm}`
      );

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const data = await response.json();
      setOtp(data.otp);
      setRemaining(data.remaining);
    } catch (error) {
      console.error('Error fetching OTP:', error);
      alert('Failed to fetch OTP. Please check backend service.');
    }
  }, [key, digits, period, algorithm]);

  useEffect(() => {
    setKey(generateRandomKey());
  }, []);

  useEffect(() => {
    if (key) {
      const timeout = setTimeout(generateOTP, 500);
      return () => clearTimeout(timeout);
    }
  }, [key, digits, period, algorithm, generateOTP]);

  useEffect(() => {
    if (remaining > 0) {
      const timer = setTimeout(() => setRemaining(remaining - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      generateOTP();
    }
  }, [remaining, generateOTP]);

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(otp)
      .then(() => {
        setCopyIcon('✔');
        setTimeout(() => setCopyIcon('📋'), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy OTP:', err);
      });
  };

  return (
    <div className="flex flex-col items-center p-5 min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-6 bg-white border border-gray-300 rounded-lg shadow-sm">
        <h2 className="text-2xl font-bold text-center mb-6">TOTP Generator</h2>

        <div className="mb-4">
          <label
            htmlFor="key"
            className="block mb-2 font-semibold text-gray-700"
          >
            Secret Key:
          </label>
          <input
            type="text"
            id="key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter TOTP Key"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="digits"
            className="block mb-2 font-semibold text-gray-700"
          >
            Digits:
          </label>
          <input
            type="number"
            id="digits"
            value={digits}
            onChange={(e) => setDigits(parseInt(e.target.value, 10))}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="period"
            className="block mb-2 font-semibold text-gray-700"
          >
            Period (seconds):
          </label>
          <input
            type="number"
            id="period"
            value={period}
            onChange={(e) => setPeriod(parseInt(e.target.value, 10))}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="algorithm"
            className="block mb-2 font-semibold text-gray-700"
          >
            Algorithm:
          </label>
          <select
            id="algorithm"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="SHA-1">SHA-1</option>
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-512">SHA-512</option>
          </select>
        </div>

        <div className="text-center mb-4">
          <h3 className="text-xl font-semibold">
            OTP: <span className="font-mono text-2xl text-blue-600">{otp}</span>
            <button
              onClick={copyToClipboard}
              className="ml-3 text-2xl hover:bg-gray-100 p-1 rounded"
            >
              {copyIcon}
            </button>
          </h3>
        </div>

        <div className="mb-4">
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-1000 ease-linear"
              style={{ width: `${(remaining / period) * 100}%` }}
            ></div>
          </div>
        </div>

        <p className="text-center text-gray-600">
          Time Left: <span className="font-semibold">{remaining}</span> sec
        </p>
      </div>

      <div className="mt-8 text-center">
        <p className="text-gray-600">
          For more details on the API, please visit the{' '}
          <a
            href={`${import.meta.env.VITE_OPTIONAL_BACKEND_URL || ''}/docs`}
            target="_blank"
            className="text-blue-600 hover:underline"
          >
            OpenAPI documentation
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default App;
