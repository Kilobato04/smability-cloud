/**
 * SMAA Air Quality Dashboard - Main Application v2.0
 * NOW WITH: AQI Calculations + Hourly History Support
 */

// Global State
let currentDevice = CONFIG.DEFAULT_DEVICE;
let autoRefreshEnabled = true;
let refreshTimer = null;
let countdownTimer = null;
let secondsLeft = CONFIG.AUTO_REFRESH_INTERVAL / 1000;
let airQualityChart = null;
let environmentChart = null;
let gasesChart = null;
let noiseChart = null;
let aqiChart = null; // NEW: AQI trend chart
let currentChartHours = CONFIG.DEFAULT_CHART_HOURS;
let currentChartMode = 'realtime'; // NEW: 'realtime' or 'hourly'
let allDevices = [];

// ==================== AQI CALCULATION (EPA STANDARDS) ====================
function calculateAQI(pollutant, concentration) {
    const breakpoints = {
        pm25: [
            { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
            { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
            { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
            { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
            { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
            { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 }
        ],
        pm10: [
            { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
            { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
            { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
            { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
            { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
            { cLow: 425, cHigh: 604, iLow: 301, iHigh: 500 }
        ],
        o3: [
            { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
            { cLow: 55, cHigh: 70, iLow: 51, iHigh: 100 },
            { cLow: 71, cHigh: 85, iLow: 101, iHigh: 150 },
            { cLow: 86, cHigh: 105, iLow: 151, iHigh: 200 },
            { cLow: 106, cHigh: 200, iLow: 201, iHigh: 300 }
        ],
        co: [
            { cLow: 0, cHigh: 4400, iLow: 0, iHigh: 50 },
            { cLow: 4500, cHigh: 9400, iLow: 51, iHigh: 100 },
            { cLow: 9500, cHigh: 12400, iLow: 101, iHigh: 150 },
            { cLow: 12500, cHigh: 15400, iLow: 151, iHigh: 200 },
            { cLow: 15500, cHigh: 30400, iLow: 201, iHigh: 300 },
            { cLow: 30500, cHigh: 50400, iLow: 301, iHigh: 500 }
        ]
    };

    const bps = breakpoints[pollutant];
    if (!bps) return 0;

    for (let bp of bps) {
        if (concentration >= bp.cLow && concentration <= bp.cHigh) {
            const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * 
                        (concentration - bp.cLow) + bp.iLow;
            return Math.round(aqi);
        }
    }
    return 500; // Hazardous
}

function getAQIInfo(aqi) {
    if (aqi <= 50) return { category: 'Good', color: '#10b981', emoji: '😊' };
    if (aqi <= 100) return { category: 'Moderate', color: '#fbbf24', emoji: '😐' };
    if (aqi <= 150) return { category: 'Unhealthy for Sensitive', color: '#f97316', emoji: '😷' };
    if (aqi <= 200) return { category: 'Unhealthy', color: '#ef4444', emoji: '😨' };
    if (aqi <= 300) return { category: 'Very Unhealthy', color: '#9333ea', emoji: '🤢' };
    return { category: 'Hazardous', color: '#7f1d1d', emoji: '☠️' };
}

function calculateOverallAQI(data) {
    const aqis = {
        pm25: calculateAQI('pm25', data.pm25 || data.pm25_avg || 0),
        pm10: calculateAQI('pm10', data.pm10 || data.pm10_avg || 0),
        o3: calculateAQI('o3', data.o3 || data.o3_avg || 0),
        co: calculateAQI('co', data.co || data.co_avg || 0)
    };
    
    const maxAQI = Math.max(...Object.values(aqis));
    const mainPollutant = Object.keys(aqis).find(key => aqis[key] === maxAQI);
    
    return { 
        aqi: maxAQI, 
        pollutant: mainPollutant.toUpperCase(),
        individual: aqis 
    };
}

// ==================== API CALLS ====================
async function apiCall(endpoint) {
    try {
        const response = await fetch(`${CONFIG.apiBase}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        updateAPIStatus('offline', 'Error');
        throw error;
    }
}

async function fetchLatestData() {
    const data = await apiCall(`?deviceID=${currentDevice}&action=latest`);
    return data.data;
}

async function fetchHistoricalData(hours = currentChartHours) {
    const data = await apiCall(`?deviceID=${currentDevice}&action=history&hours=${hours}&limit=${CONFIG.HISTORY_LIMIT}`);
    return data.data || [];
}

// NEW: Fetch hourly history
async function fetchHourlyHistory(hours) {
    const days = Math.ceil(hours / 24);
    const data = await apiCall(`?deviceID=${currentDevice}&action=hourly_history&days=${days}`);
    
    // FIXED: Don't filter by time - just return all records from API
    // The Lambda already returns sorted data, newest first
    // We want the LATEST available data, even if slightly delayed
    if (data.data && data.data.length > 0) {
        console.log(`📊 Hourly history: ${data.data.length} records`);
        console.log('Latest hourly record:', {
            timestamp: data.data[data.data.length - 1].hour_timestamp_utc,
            time: new Date(data.data[data.data.length - 1].hour_timestamp_utc * 1000).toLocaleString(),
            aqi: data.data[data.data.length - 1].aqi
        });
        
        // For shorter time ranges, return the requested number
        if (hours < 24) {
            return data.data.slice(-hours);
        }
        return data.data;
    }
    return [];
}

async function fetchDevices() {
    const data = await apiCall('?action=devices');
    allDevices = data.devices || [];
    updateDeviceSummary(data);
    return allDevices;
}

// ==================== TIMESTAMP FORMATTING ====================
function formatTimestamp(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    const options = {
        timeZone: CONFIG.TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: !CONFIG.USE_24_HOUR_FORMAT
    };
    
    if (CONFIG.SHOW_SECONDS) options.second = '2-digit';
    return date.toLocaleString('en-US', options);
}

function formatRelativeTime(unixTimestamp) {
    const now = Date.now();
    const then = unixTimestamp * 1000;
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
}

// ==================== UI UPDATES ====================
function updateAPIStatus(status, text) {
    const indicator = document.getElementById('apiStatus');
    const statusText = document.getElementById('apiStatusText');
    
    indicator.className = `status-indicator status-${status}`;
    statusText.textContent = text;
}

function updateDeviceSummary(data) {
    document.getElementById('totalDevices').textContent = data.count || 0;
    document.getElementById('onlineDevices').textContent = data.online_count || 0;
    document.getElementById('offlineDevices').textContent = data.offline_count || 0;
}

// NEW: Update AQI Card (Mode-Aware)
async function updateAQICard(data) {
    let aqiValue, aqiCategory, mainPollutant;
    const isMobile = data.mode === 1;
    
    try {
        // MOBILE MODE: Always use real-time (user wants current location AQI)
        if (isMobile) {
            const aqiData = calculateOverallAQI(data);
            aqiValue = aqiData.aqi;
            mainPollutant = aqiData.pollutant;
            aqiCategory = getAQIInfo(aqiValue).category;
            
            console.log('📍 Mobile mode: Using real-time AQI:', aqiValue);
        } else {
            // FIXED MODE: Prefer hourly averages if available
            const hourlyData = await fetchHourlyHistory(1);
            
            if (hourlyData && hourlyData.length > 0) {
                const latestHourly = hourlyData[hourlyData.length - 1];
                const dataCompleteness = latestHourly.data_completeness || 0;
                const qualityStatus = latestHourly.quality_status || 'poor';
                const qualityScore = latestHourly.quality_score || 0;
                
                // Use hourly if quality is acceptable (score >= 70 OR completeness >= 75%)
                if (qualityScore >= 70 || dataCompleteness >= 75) {
                    aqiValue = latestHourly.aqi || 0;
                    aqiCategory = latestHourly.aqi_category || 'Unknown';
                    mainPollutant = latestHourly.aqi_pollutant || 'N/A';
                    
                    console.log(`✅ Fixed mode - Hourly AQI: ${aqiValue} (${dataCompleteness.toFixed(1)}%, ${qualityStatus})`);
                } else {
                    // Poor quality - use real-time
                    const aqiData = calculateOverallAQI(data);
                    aqiValue = aqiData.aqi;
                    mainPollutant = aqiData.pollutant;
                    aqiCategory = getAQIInfo(aqiValue).category;
                    
                    console.log(`⚠️ Fixed mode - Low quality (${qualityScore}) - using real-time:`, aqiValue);
                }
            } else {
                // No hourly data - use real-time
                const aqiData = calculateOverallAQI(data);
                aqiValue = aqiData.aqi;
                mainPollutant = aqiData.pollutant;
                aqiCategory = getAQIInfo(aqiValue).category;
                
                console.log('⚠️ Fixed mode - No hourly data - using real-time:', aqiValue);
            }
        }
    } catch (error) {
        console.error('Error fetching hourly AQI:', error);
        // Fallback to real-time calculation
        const aqiData = calculateOverallAQI(data);
        aqiValue = aqiData.aqi;
        mainPollutant = aqiData.pollutant;
        aqiCategory = getAQIInfo(aqiValue).category;
    }
    
    const aqiInfo = getAQIInfo(aqiValue);
    
    document.getElementById('aqiValue').textContent = aqiValue;
    document.getElementById('aqiCategory').textContent = aqiCategory;
    
    // Update pollutant text to show mode
    const modeIndicator = isMobile ? '📍 ' : '';
    document.getElementById('aqiPollutant').textContent = `${modeIndicator}Main: ${mainPollutant}`;
    
    const aqiCard = document.querySelector('.aqi-card');
    aqiCard.style.setProperty('--aqi-color', aqiInfo.color);
    aqiCard.className = `card aqi-card aqi-${aqiCategory.toLowerCase().replace(/ /g, '-')}`;
}

function updateUI(data) {
    if (!data) return;

    // Add update animation
    document.querySelectorAll('.card-value').forEach(el => {
        el.classList.add('updating');
        setTimeout(() => el.classList.remove('updating'), 300);
    });

    // GPS buffering logic (unchanged)
    const deviceKey = data.deviceID;
    
    if (data.mode == 1 && data.gps && data.gps.trim() !== '') {
        let gpsBuffer = JSON.parse(localStorage.getItem(`${deviceKey}_gps_buffer`) || '[]');
        const [lat, lon] = data.gps.split(',').map(parseFloat);
        
        gpsBuffer.push({
            lat, 
            lon, 
            timestamp: data.timestamp
        });
        
        if (gpsBuffer.length > 5) {
            gpsBuffer = gpsBuffer.slice(-5);
        }
        
        localStorage.setItem(`${deviceKey}_gps_buffer`, JSON.stringify(gpsBuffer));
        localStorage.setItem(`${deviceKey}_previous_mode`, '1');
        
        if (gpsBuffer.length === 5) {
            const avgLat = gpsBuffer.reduce((sum, p) => sum + p.lat, 0) / 5;
            const avgLon = gpsBuffer.reduce((sum, p) => sum + p.lon, 0) / 5;
            const avgGPS = `${avgLat.toFixed(6)},${avgLon.toFixed(6)}`;
            
            localStorage.setItem(`${deviceKey}_fixed_gps`, avgGPS);
            localStorage.setItem(`${deviceKey}_fixed_gps_timestamp`, Date.now().toString());
        }
    }
    
    const previousMode = localStorage.getItem(`${deviceKey}_previous_mode`);
    if (previousMode == '1' && data.mode == 0) {
        const gpsBuffer = JSON.parse(localStorage.getItem(`${deviceKey}_gps_buffer`) || '[]');
        
        if (gpsBuffer.length >= 3) {
            const avgLat = gpsBuffer.reduce((sum, p) => sum + p.lat, 0) / gpsBuffer.length;
            const avgLon = gpsBuffer.reduce((sum, p) => sum + p.lon, 0) / gpsBuffer.length;
            const avgGPS = `${avgLat.toFixed(6)},${avgLon.toFixed(6)}`;
            
            localStorage.setItem(`${deviceKey}_fixed_gps`, avgGPS);
            localStorage.setItem(`${deviceKey}_fixed_gps_timestamp`, Date.now().toString());
        }
        
        localStorage.removeItem(`${deviceKey}_gps_buffer`);
        localStorage.setItem(`${deviceKey}_previous_mode`, '0');
    }
    
    if (data.mode == 0) {
        localStorage.setItem(`${deviceKey}_previous_mode`, '0');
    }

    // Update sensor values
    document.getElementById('pm25Value').textContent = data.pm25 || '--';
    document.getElementById('pm10Value').textContent = data.pm10 || '--';
    document.getElementById('o3Value').textContent = data.o3 || '--';
    document.getElementById('coValue').textContent = data.co || '--';
    document.getElementById('tempValue').textContent = parseFloat(data.temperature || 0).toFixed(1);
    document.getElementById('humidityValue').textContent = parseFloat(data.humidity || 0).toFixed(1);
    document.getElementById('noiseValue').textContent = parseFloat(data.noise || 0).toFixed(1);
    
    const batteryValue = parseFloat(data.battery || 0).toFixed(0);
    document.getElementById('batteryValue').textContent = batteryValue;
    
    // Update battery indicator
    const batteryFill = document.getElementById('batteryFill');
    batteryFill.style.width = `${batteryValue}%`;
    if (batteryValue < 20) {
        batteryFill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
    } else if (batteryValue < 50) {
        batteryFill.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
    } else {
        batteryFill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
    }
    
    // Update status badges
    updateStatusBadge('pm25', data.pm25);
    updateStatusBadge('pm10', data.pm10);
    updateStatusBadge('o3', data.o3);
    updateStatusBadge('co', data.co);
    
    // FIXED: Update AQI Card (now async to fetch hourly data)
    updateAQICard(data).catch(err => console.error('AQI update error:', err));
    
    // Update metadata
    const lastUpdate = formatRelativeTime(data.timestamp);
    const fullTime = formatTimestamp(data.timestamp);
    document.getElementById('lastUpdate').textContent = lastUpdate;
    document.getElementById('lastUpdate').title = fullTime;
    document.getElementById('deviceName').textContent = data.deviceID || currentDevice;
    
    // Update mode badge
    const modeBadge = document.getElementById('modeBadge');
    if (data.mode == 1) {
        modeBadge.textContent = 'Mobile';
        modeBadge.className = 'mode-badge mode-mobile';
    } else {
        modeBadge.textContent = 'Fixed';
        modeBadge.className = 'mode-badge mode-fixed';
    }
    
    updateAPIStatus('online', 'Connected');
}

// ==================== STATUS BADGES ====================
function updateStatusBadge(sensor, value) {
    const status = getStatusInfo(sensor, value);
    const badge = document.getElementById(sensor + 'Status');
    badge.textContent = status.text;
    badge.className = 'card-status ' + status.class;
}

// ==================== CHART MANAGEMENT - REAL-TIME MODE ====================
function updateChart(data) {
    if (!data || data.length === 0) return;

    data.sort((a, b) => a.timestamp - b.timestamp);
    const labels = data.map(d => formatTimestamp(d.timestamp));

    updateAirQualityChart(data, labels);
    updateEnvironmentChart(data, labels);
    updateGasesChart(data, labels);
    updateNoiseChart(data, labels);
}

// ==================== CHART MANAGEMENT - HOURLY MODE ====================
function updateHourlyCharts(data) {
    if (!data || data.length === 0) return;

    data.sort((a, b) => a.hour_timestamp_utc - b.hour_timestamp_utc);
    const labels = data.map(d => formatTimestamp(d.hour_timestamp_utc));

    updateAirQualityChartHourly(data, labels);
    updateEnvironmentChartHourly(data, labels);
    updateGasesChartHourly(data, labels);
    updateNoiseChartHourly(data, labels);
    updateAQIChartHourly(data, labels); // NEW: AQI trend chart
}

// Real-time chart functions (unchanged)
function updateAirQualityChart(data, labels) {
    if (airQualityChart) airQualityChart.destroy();
    const ctx = document.getElementById('airQualityChart').getContext('2d');
    
    const pm25Data = data.map((d, i) => {
        if (i > 0 && d.timestamp - data[i-1].timestamp > 300) return null;
        return d.pm25;
    });
    
    const pm10Data = data.map((d, i) => {
        if (i > 0 && d.timestamp - data[i-1].timestamp > 300) return null;
        return d.pm10;
    });
    
    airQualityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'PM2.5',
                    data: pm25Data,
                    borderColor: CONFIG.CHART_COLORS.pm25,
                    backgroundColor: CONFIG.CHART_COLORS.pm25 + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    spanGaps: false
                },
                {
                    label: 'PM10',
                    data: pm10Data,
                    borderColor: CONFIG.CHART_COLORS.pm10,
                    backgroundColor: CONFIG.CHART_COLORS.pm10 + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    spanGaps: false
                }
            ]
        },
        options: getChartOptions('Air Quality (PM2.5 & PM10)', 'μg/m³')
    });
}

function updateEnvironmentChart(data, labels) {
    if (environmentChart) environmentChart.destroy();
    const ctx = document.getElementById('environmentChart').getContext('2d');
    
    const tempData = data.map((d, i) => {
        if (i > 0 && d.timestamp - data[i-1].timestamp > 300) return null;
        return d.temperature;
    });
    
    const humidityData = data.map((d, i) => {
        if (i > 0 && d.timestamp - data[i-1].timestamp > 300) return null;
        return d.humidity;
    });
    
    environmentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Temperature',
                    data: tempData,
                    borderColor: CONFIG.CHART_COLORS.temperature,
                    backgroundColor: CONFIG.CHART_COLORS.temperature + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y',
                    fill: true,
                    spanGaps: false
                },
                {
                    label: 'Humidity',
                    data: humidityData,
                    borderColor: CONFIG.CHART_COLORS.humidity,
                    backgroundColor: CONFIG.CHART_COLORS.humidity + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    fill: true,
                    spanGaps: false
                }
            ]
        },
        options: getDualAxisChartOptions('Temperature & Humidity', '°C', '%')
    });
}

function updateGasesChart(data, labels) {
    if (gasesChart) gasesChart.destroy();
    const ctx = document.getElementById('gasesChart').getContext('2d');
    
    const coData = data.map((d, i) => {
        if (i > 0 && d.timestamp - data[i-1].timestamp > 300) return null;
        return d.co;
    });
    
    const o3Data = data.map((d, i) => {
        if (i > 0 && d.timestamp - data[i-1].timestamp > 300) return null;
        return d.o3;
    });
    
    gasesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'CO',
                    data: coData,
                    borderColor: CONFIG.CHART_COLORS.co,
                    backgroundColor: CONFIG.CHART_COLORS.co + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y',
                    fill: true,
                    spanGaps: false
                },
                {
                    label: 'Ozone',
                    data: o3Data,
                    borderColor: CONFIG.CHART_COLORS.o3,
                    backgroundColor: CONFIG.CHART_COLORS.o3 + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    fill: true,
                    spanGaps: false
                }
            ]
        },
        options: getDualAxisChartOptions('Gaseous Pollutants (CO & O₃)', 'CO (ppb)', 'O₃ (ppb)')
    });
}

function updateNoiseChart(data, labels) {
    if (noiseChart) noiseChart.destroy();
    const ctx = document.getElementById('noiseChart').getContext('2d');
    
    const noiseData = data.map((d, i) => {
        if (i > 0 && d.timestamp - data[i-1].timestamp > 300) return null;
        return d.noise;
    });
    
    noiseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Noise',
                    data: noiseData,
                    borderColor: CONFIG.CHART_COLORS.noise,
                    backgroundColor: CONFIG.CHART_COLORS.noise + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    spanGaps: false
                }
            ]
        },
        options: getChartOptions('Noise Level', 'dBA')
    });
}

// NEW: Hourly chart functions
function updateAirQualityChartHourly(data, labels) {
    if (airQualityChart) airQualityChart.destroy();
    const ctx = document.getElementById('airQualityChart').getContext('2d');
    
    // DEBUG: Log what we're charting
    console.log('📈 Charting hourly air quality:', {
        records: data.length,
        firstTime: labels[0],
        lastTime: labels[labels.length - 1],
        latestAQI: data[data.length - 1]?.aqi
    });
    
    airQualityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'PM2.5 (Hourly Avg)',
                    data: data.map(d => d.pm25_avg),
                    borderColor: CONFIG.CHART_COLORS.pm25,
                    backgroundColor: CONFIG.CHART_COLORS.pm25 + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'PM10 (Hourly Avg)',
                    data: data.map(d => d.pm10_avg),
                    borderColor: CONFIG.CHART_COLORS.pm10,
                    backgroundColor: CONFIG.CHART_COLORS.pm10 + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: getChartOptions('Air Quality - Hourly Averages', 'μg/m³')
    });
}

function updateEnvironmentChartHourly(data, labels) {
    if (environmentChart) environmentChart.destroy();
    const ctx = document.getElementById('environmentChart').getContext('2d');
    
    environmentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Temperature (Hourly Avg)',
                    data: data.map(d => d.temperature_avg),
                    borderColor: CONFIG.CHART_COLORS.temperature,
                    backgroundColor: CONFIG.CHART_COLORS.temperature + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y',
                    fill: true
                },
                {
                    label: 'Humidity (Hourly Avg)',
                    data: data.map(d => d.humidity_avg),
                    borderColor: CONFIG.CHART_COLORS.humidity,
                    backgroundColor: CONFIG.CHART_COLORS.humidity + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    fill: true
                }
            ]
        },
        options: getDualAxisChartOptions('Environment - Hourly Averages', '°C', '%')
    });
}

function updateGasesChartHourly(data, labels) {
    if (gasesChart) gasesChart.destroy();
    const ctx = document.getElementById('gasesChart').getContext('2d');
    
    gasesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'CO (Hourly Avg)',
                    data: data.map(d => d.co_avg),
                    borderColor: CONFIG.CHART_COLORS.co,
                    backgroundColor: CONFIG.CHART_COLORS.co + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y',
                    fill: true
                },
                {
                    label: 'Ozone (Hourly Avg)',
                    data: data.map(d => d.o3_avg),
                    borderColor: CONFIG.CHART_COLORS.o3,
                    backgroundColor: CONFIG.CHART_COLORS.o3 + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    fill: true
                }
            ]
        },
        options: getDualAxisChartOptions('Gases - Hourly Averages', 'CO (ppb)', 'O₃ (ppb)')
    });
}

function updateNoiseChartHourly(data, labels) {
    if (noiseChart) noiseChart.destroy();
    const ctx = document.getElementById('noiseChart').getContext('2d');
    
    noiseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Noise (Hourly Avg)',
                    data: data.map(d => d.noise_avg),
                    borderColor: CONFIG.CHART_COLORS.noise,
                    backgroundColor: CONFIG.CHART_COLORS.noise + '20',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: getChartOptions('Noise - Hourly Average', 'dBA')
    });
}

// NEW: AQI Trend Chart
function updateAQIChartHourly(data, labels) {
    if (aqiChart) aqiChart.destroy();
    const ctx = document.getElementById('aqiChart').getContext('2d');
    
    const aqiData = data.map(d => d.aqi || 0);
    const backgroundColors = aqiData.map(aqi => {
        const info = getAQIInfo(aqi);
        return info.color + '60';
    });
    
    aqiChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'AQI (Hourly)',
                    data: aqiData,
                    backgroundColor: backgroundColors,
                    borderColor: aqiData.map(aqi => getAQIInfo(aqi).color),
                    borderWidth: 2
                }
            ]
        },
        options: {
            ...getChartOptions('Air Quality Index - Hourly Trend', 'AQI'),
            plugins: {
                ...getChartOptions('', '').plugins,
                annotation: {
                    annotations: {
                        good: {
                            type: 'line',
                            yMin: 50,
                            yMax: 50,
                            borderColor: '#10b981',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: 'Good',
                                position: 'end'
                            }
                        },
                        moderate: {
                            type: 'line',
                            yMin: 100,
                            yMax: 100,
                            borderColor: '#fbbf24',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: 'Moderate',
                                position: 'end'
                            }
                        },
                        unhealthy: {
                            type: 'line',
                            yMin: 150,
                            yMax: 150,
                            borderColor: '#f97316',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: 'Unhealthy',
                                position: 'end'
                            }
                        }
                    }
                }
            }
        }
    });
}

function getChartOptions(title, yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { 
            mode: 'index', 
            intersect: false 
        },
        plugins: {
            title: { 
                display: true, 
                text: title, 
                font: { 
                    size: window.innerWidth < 768 ? 12 : 14, 
                    weight: 'bold' 
                } 
            },
            legend: { 
                position: window.innerWidth < 768 ? 'bottom' : 'top',
                labels: {
                    font: { size: window.innerWidth < 768 ? 10 : 12 },
                    boxWidth: window.innerWidth < 768 ? 30 : 40
                }
            },
            tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: window.innerWidth < 768 ? 8 : 12,
                titleFont: { size: window.innerWidth < 768 ? 11 : 13 },
                bodyFont: { size: window.innerWidth < 768 ? 10 : 12 }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                title: { 
                    display: window.innerWidth >= 768, 
                    text: yLabel, 
                    font: { weight: 'bold' } 
                },
                ticks: {
                    font: { size: window.innerWidth < 768 ? 9 : 11 }
                }
            },
            x: {
                ticks: { 
                    maxRotation: 45, 
                    minRotation: 45, 
                    maxTicksLimit: window.innerWidth < 768 ? 5 : 8,
                    font: { size: window.innerWidth < 768 ? 8 : 10 }
                },
                grid: { color: 'rgba(0, 0, 0, 0.05)' }
            }
        }
    };
}

function getDualAxisChartOptions(title, yLabel, y1Label) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { 
            mode: 'index', 
            intersect: false 
        },
        plugins: {
            title: { 
                display: true, 
                text: title, 
                font: { 
                    size: window.innerWidth < 768 ? 12 : 14, 
                    weight: 'bold' 
                } 
            },
            legend: { 
                position: window.innerWidth < 768 ? 'bottom' : 'top',
                labels: {
                    font: { size: window.innerWidth < 768 ? 10 : 12 },
                    boxWidth: window.innerWidth < 768 ? 30 : 40
                }
            },
            tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: window.innerWidth < 768 ? 8 : 12,
                titleFont: { size: window.innerWidth < 768 ? 11 : 13 },
                bodyFont: { size: window.innerWidth < 768 ? 10 : 12 }
            }
        },
        scales: {
            y: {
                type: 'linear',
                position: 'left',
                beginAtZero: true,
                title: { 
                    display: window.innerWidth >= 768, 
                    text: yLabel, 
                    font: { weight: 'bold' } 
                },
                ticks: {
                    font: { size: window.innerWidth < 768 ? 9 : 11 }
                }
            },
            y1: {
                type: 'linear',
                position: 'right',
                beginAtZero: true,
                title: { 
                    display: window.innerWidth >= 768, 
                    text: y1Label, 
                    font: { weight: 'bold' } 
                },
                grid: { drawOnChartArea: false },
                ticks: {
                    font: { size: window.innerWidth < 768 ? 9 : 11 }
                }
            },
            x: {
                ticks: { 
                    maxRotation: 45, 
                    minRotation: 45, 
                    maxTicksLimit: window.innerWidth < 768 ? 5 : 8,
                    font: { size: window.innerWidth < 768 ? 8 : 10 }
                },
                grid: { color: 'rgba(0, 0, 0, 0.05)' }
            }
        }
    };
}

// NEW: Update chart range with tab switching
async function updateChartRange(mode, hours = null) {
    currentChartMode = mode;
    
    // Update tab buttons
    document.querySelectorAll('.chart-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Show/hide AQI chart based on mode
    const aqiChartContainer = document.getElementById('aqiChartContainer');
    if (aqiChartContainer) {
        aqiChartContainer.style.display = mode === 'realtime' ? 'none' : 'block';
    }
    
    try {
        if (mode === 'realtime') {
            // Real-time mode: Use existing history API (last 2 hours)
            const data = await fetchHistoricalData(2);
            updateChart(data);
        } else {
            // Hourly mode: Use hourly_history API
            const data = await fetchHourlyHistory(hours);
            updateHourlyCharts(data);
        }
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}

// ==================== DEVICE MANAGEMENT ====================
async function loadDevices() {
    try {
        const devices = await fetchDevices();
        const select = document.getElementById('deviceSelect');
        select.innerHTML = '';
        
        if (devices.length > 0) {
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceID;
                const statusIcon = device.online ? '🟢' : '🔴';
                const lastSeen = device.online ? '' : ` (${device.last_seen})`;
                option.textContent = `${statusIcon} ${device.deviceID}${lastSeen}`;
                if (device.deviceID === currentDevice) option.selected = true;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option>No devices found</option>';
        }
    } catch (error) {
        console.error('Error loading devices:', error);
        document.getElementById('deviceSelect').innerHTML = '<option>Error loading devices</option>';
    }
}

function changeDevice() {
    currentDevice = document.getElementById('deviceSelect').value;
    fetchData();
}

// ==================== DATA FETCHING ====================
async function fetchData() {
    try {
        const latest = await fetchLatestData();
        updateUI(latest);
        
        // Fetch appropriate chart data based on current mode
        if (currentChartMode === 'realtime') {
            const history = await fetchHistoricalData(2);
            updateChart(history);
        } else {
            // Re-fetch hourly data with current hours setting
            const activeBtn = document.querySelector('.chart-btn.active');
            const hours = parseInt(activeBtn?.dataset.hours || 24);
            const hourly = await fetchHourlyHistory(hours);
            updateHourlyCharts(hourly);
        }
        
        resetRefreshCountdown();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// ==================== AUTO-REFRESH ====================
function startAutoRefresh() {
    if (!CONFIG.FEATURES.enableAutoRefresh) return;
    
    if (refreshTimer) clearInterval(refreshTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    
    refreshTimer = setInterval(() => {
        fetchData();
        if (document.getElementById('fixed-map-tab').classList.contains('active')) {
            loadFixedDeviceLocation();
        }
        if (document.getElementById('mobile-map-tab').classList.contains('active')) {
            loadMobileRoute();
        }
    }, CONFIG.AUTO_REFRESH_INTERVAL);
    
    countdownTimer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) secondsLeft = CONFIG.AUTO_REFRESH_INTERVAL / 1000;
        document.getElementById('refreshCounter').textContent = `${secondsLeft}s`;
    }, 1000);
}

function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    document.getElementById('refreshCounter').textContent = 'Paused';
}

function resetRefreshCountdown() {
    secondsLeft = CONFIG.AUTO_REFRESH_INTERVAL / 1000;
}

function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    const btn = document.getElementById('autoRefreshBtn');
    
    if (autoRefreshEnabled) {
        btn.innerHTML = '<span class="btn-icon">⏸️</span> Pause Auto-Refresh';
        startAutoRefresh();
    } else {
        btn.innerHTML = '<span class="btn-icon">▶️</span> Resume Auto-Refresh';
        stopAutoRefresh();
    }
}

// ==================== UTILITY FUNCTIONS ====================
function showAbout() {
    alert('SMAA Air Quality Monitoring System v2.0\n\nNEW: Hourly Historical Data & AQI Index\n\nDeveloped for real-time air quality monitoring using AWS IoT Core.\n\nFor support, contact: support@smaa.io');
}

function showHelp() {
    alert('Dashboard Help:\n\n• Select device from dropdown\n• Auto-refresh updates every 20 seconds\n• Click sensor cards for details\n• Use chart tabs:\n  - Real-Time: Last 2 hours\n  - 8H/24H/48H/Week: Hourly averages\n• AQI card shows overall air quality\n• Green indicator = device online\n• Red indicator = device offline');
}

function exportData() {
    if (!CONFIG.FEATURES.enableExport) {
        alert('Export feature is currently disabled.');
        return;
    }
    
    fetchHistoricalData(48).then(data => {
        const csv = convertToCSV(data);
        downloadCSV(csv, `${currentDevice}_${Date.now()}.csv`);
    });
}

function convertToCSV(data) {
    const headers = ['Timestamp', 'PM2.5', 'PM10', 'O3', 'CO', 'Temperature', 'Humidity', 'Noise', 'Battery', 'Mode'];
    const rows = data.map(d => [
        formatTimestamp(d.timestamp),
        d.pm25,
        d.pm10,
        d.o3,
        d.co,
        d.temperature,
        d.humidity,
        d.noise,
        d.battery,
        d.mode == 1 ? 'Mobile' : 'Fixed'
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

function hideLoadingOverlay() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

// ==================== INITIALIZATION ====================
window.onload = async function() {
    console.log('SMAA Dashboard v2.0 initializing...');
    console.log('API URL:', CONFIG.apiBase);
    console.log('Default Device:', CONFIG.DEFAULT_DEVICE);
    
    try {
        updateAPIStatus('online', 'Connecting...');
        await loadDevices();
        await fetchData();
        if (CONFIG.FEATURES.enableAutoRefresh) startAutoRefresh();
        hideLoadingOverlay();
        console.log('Dashboard ready!');
    } catch (error) {
        console.error('Initialization error:', error);
        updateAPIStatus('offline', 'Failed');
        hideLoadingOverlay();
        alert('Failed to load dashboard. Please check your configuration and try again.');
    }
};

// ==================== ERROR HANDLING ====================
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
});
