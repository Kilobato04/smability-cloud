const CONFIG = {
    apiBase: 'https://jciiy1ok97.execute-api.us-east-1.amazonaws.com/default/getData',  // Your API URL
    DEFAULT_DEVICE: 'SMAA_001',  // Default to your tested device
    TIMEZONE: 'America/Mexico_City',  // UTC-6; adjust as needed
    USE_24_HOUR_FORMAT: false,  // 12-hour format
    SHOW_SECONDS: false,  // No seconds in timestamps
    AUTO_REFRESH_INTERVAL: 10000,  // 10 seconds
    HISTORY_LIMIT: 100,  // Max history points
    DEFAULT_CHART_HOURS: 24,  // Default chart range
    FEATURES: {
        enableAutoRefresh: true,
        enableExport: true
    },
    THRESHOLDS: {  // EPA standards
        pm25: { good: 12, moderate: 35.4 },
        pm10: { good: 54, moderate: 154 },
        o3: { good: 54, moderate: 70 },
        co: { good: 4400, moderate: 9400 }
    },
    CHART_COLORS: {  // Match CSS
        pm25: '#3b82f6',  // Blue
        pm10: '#8b5cf6',  // Purple
        o3: '#ec4899',  // Pink
        co: '#f59e0b',  // Amber
        temperature: '#ef4444',  // Red
        humidity: '#10b981',  // Green
        noise: '#14b8a6',  // Teal
        battery: '#6366f1'  // Indigo
    },
    devices: [{id:'SMAA_001',name:'SMAA_001'},{id:'SMAA_002',name:'SMAA_002'}],
    mapDefault: {lat:19.4326,lng:-99.1332,zoom:13},
    pollIntervalSec: 10
};
