const CONFIG = {
    apiBase: 'https://jciiy1ok97.execute-api.us-east-1.amazonaws.com/default/getData',
    DEFAULT_DEVICE: 'SMAA_001',
    TIMEZONE: 'America/Mexico_City',  // UTC-6
    USE_24_HOUR_FORMAT: false,
    SHOW_SECONDS: false,
    AUTO_REFRESH_INTERVAL: 20000,  // 20 seconds
    HISTORY_LIMIT: 100,
    DEFAULT_CHART_HOURS: 24,
    
    FEATURES: {
        enableAutoRefresh: true,
        enableExport: true
    },
    
    THRESHOLDS: {
        pm25: { good: 12, moderate: 35.4 },
        pm10: { good: 54, moderate: 154 },
        o3: { good: 54, moderate: 70 },
        co: { good: 4400, moderate: 9400 }
    },
    
    CHART_COLORS: {
        pm25: '#3b82f6',      // Blue
        pm10: '#8b5cf6',      // Purple
        o3: '#ec4899',        // Pink
        co: '#f59e0b',        // Amber
        temperature: '#ef4444', // Red
        humidity: '#10b981',  // Green
        noise: '#14b8a6',     // Teal
        battery: '#6366f1',   // Indigo
        aqi: '#667eea'        // NEW: AQI color
    },
    
    // NEW: AQI Color Scale (EPA Standard)
    AQI_COLORS: {
        good: '#10b981',              // 0-50: Green
        moderate: '#fbbf24',          // 51-100: Yellow
        unhealthySensitive: '#f97316', // 101-150: Orange
        unhealthy: '#ef4444',         // 151-200: Red
        veryUnhealthy: '#9333ea',     // 201-300: Purple
        hazardous: '#7f1d1d'          // 301+: Maroon
    },
    
    devices: [
        {id:'SMAA_001', name:'SMAA_001'},
        {id:'SMAA_002', name:'SMAA_002'}
    ],
    
    mapDefault: {
        lat: 19.4326,
        lng: -99.1332,
        zoom: 13
    },
    
    pollIntervalSec: 10
};
