/**
 * SMAA Air Quality Dashboard - Main Application
 * Handles data fetching, UI updates, and user interactions
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
let currentChartHours = CONFIG.DEFAULT_CHART_HOURS;
let allDevices = [];

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

function updateUI(data) {
    if (!data) return;

    // Add update animation
    document.querySelectorAll('.card-value').forEach(el => {
        el.classList.add('updating');
        setTimeout(() => el.classList.remove('updating'), 300);
    });

    // IMPROVED GPS buffering logic
    const deviceKey = data.deviceID;
    
    if (data.mode == 1 && data.gps && data.gps.trim() !== '') {
        // Device is mobile - buffer GPS readings
        let gpsBuffer = JSON.parse(localStorage.getItem(`${deviceKey}_gps_buffer`) || '[]');
        const [lat, lon] = data.gps.split(',').map(parseFloat);
        
        // Add timestamp to buffer entry
        gpsBuffer.push({
            lat, 
            lon, 
            timestamp: data.timestamp
        });
        
        // Keep last 5 readings
        if (gpsBuffer.length > 5) {
            gpsBuffer = gpsBuffer.slice(-5);
        }
        
        localStorage.setItem(`${deviceKey}_gps_buffer`, JSON.stringify(gpsBuffer));
        localStorage.setItem(`${deviceKey}_previous_mode`, '1');
        
        console.log(`Buffered GPS for ${deviceKey}: ${data.gps} (buffer: ${gpsBuffer.length}/5)`);
        
        // Auto-average when we have 5 points
        if (gpsBuffer.length === 5) {
            const avgLat = gpsBuffer.reduce((sum, p) => sum + p.lat, 0) / 5;
            const avgLon = gpsBuffer.reduce((sum, p) => sum + p.lon, 0) / 5;
            const avgGPS = `${avgLat.toFixed(6)},${avgLon.toFixed(6)}`;
            
            localStorage.setItem(`${deviceKey}_fixed_gps`, avgGPS);
            localStorage.setItem(`${deviceKey}_fixed_gps_timestamp`, Date.now().toString());
            
            console.log(`Auto-saved averaged GPS for ${deviceKey}: ${avgGPS}`);
        }
    }
    
    // Detect mode transition from mobile (1) to fixed (0)
    const previousMode = localStorage.getItem(`${deviceKey}_previous_mode`);
    if (previousMode == '1' && data.mode == 0) {
        const gpsBuffer = JSON.parse(localStorage.getItem(`${deviceKey}_gps_buffer`) || '[]');
        
        if (gpsBuffer.length >= 3) {
            // Calculate average from buffer
            const avgLat = gpsBuffer.reduce((sum, p) => sum + p.lat, 0) / gpsBuffer.length;
            const avgLon = gpsBuffer.reduce((sum, p) => sum + p.lon, 0) / gpsBuffer.length;
            const avgGPS = `${avgLat.toFixed(6)},${avgLon.toFixed(6)}`;
            
            localStorage.setItem(`${deviceKey}_fixed_gps`, avgGPS);
            localStorage.setItem(`${deviceKey}_fixed_gps_timestamp`, Date.now().toString());
            
            console.log(`Mode transition: Saved averaged GPS for ${deviceKey}: ${avgGPS}`);
        }
        
        // Clear buffer after transition
        localStorage.removeItem(`${deviceKey}_gps_buffer`);
        localStorage.setItem(`${deviceKey}_previous_mode`, '0');
    }
    
    // Update current mode
    if (data.mode == 0) {
        localStorage.setItem(`${deviceKey}_previous_mode`, '0');
    }

    // Update sensor values (rest stays the same)
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
    
    // Update API status
    updateAPIStatus('online', 'Connected');
}

// ==================== STATUS BADGES ====================
function updateStatusBadge(sensor, value) {
    const status = getStatusInfo(sensor, value);
    const badge = document.getElementById(sensor + 'Status');
    badge.textContent = status.text;
    badge.className = 'card-status ' + status.class;
}

// ==================== MULTI-PANEL CHART MANAGEMENT ====================
function updateChart(data) {
    if (!data || data.length === 0) return;

    const labels = data.map(d => formatTimestamp(d.timestamp)).reverse();
	const reversedData = data.reverse();  // Reverse data to match labels

    // Panel 1: Air Quality (PM2.5 & PM10)
    updateAirQualityChart(reversedData, labels);
    
    // Panel 2: Environment (Temperature & Humidity)
    updateEnvironmentChart(reversedData, labels);
    
    // Panel 3: Gases (CO & O3)
    updateGasesChart(reversedData, labels);
    
    // Panel 4: Noise
    updateNoiseChart(reversedData, labels);
}

// ==================== IMPROVED CHART FUNCTIONS ====================
// Replace the chart functions in app.js with these:

function updateChart(data) {
    if (!data || data.length === 0) return;

    // Sort ascending for oldest first (left to right)
    data.sort((a, b) => a.timestamp - b.timestamp);
    
    const labels = data.map(d => formatTimestamp(d.timestamp));

    // Panel 1: Air Quality (PM2.5 & PM10)
    updateAirQualityChart(data, labels);
    
    // Panel 2: Environment (Temperature & Humidity)
    updateEnvironmentChart(data, labels);
    
    // Panel 3: Gases (CO & O3)
    updateGasesChart(data, labels);
    
    // Panel 4: Noise
    updateNoiseChart(data, labels);
}

function updateAirQualityChart(data, labels) {
    if (airQualityChart) airQualityChart.destroy();
    const ctx = document.getElementById('airQualityChart').getContext('2d');
    
    // Detect gaps in data (more than 5 minutes between readings)
    const pm25Data = data.map((d, i) => {
        if (i > 0) {
            const timeDiff = d.timestamp - data[i-1].timestamp;
            if (timeDiff > 300) return null; // 5 minute gap
        }
        return d.pm25;
    });
    
    const pm10Data = data.map((d, i) => {
        if (i > 0) {
            const timeDiff = d.timestamp - data[i-1].timestamp;
            if (timeDiff > 300) return null;
        }
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
                    spanGaps: false // Don't connect across null values
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

function updateChartRange(hours) {
    currentChartHours = hours;
    document.querySelectorAll('.chart-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    fetchHistoricalData(hours).then(updateChart);
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
        const [latest, history] = await Promise.all([
            fetchLatestData(),
            fetchHistoricalData()
        ]);
        updateUI(latest);
        updateChart(history);
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
    
    //refreshTimer = setInterval(fetchData, CONFIG.AUTO_REFRESH_INTERVAL);
	
	refreshTimer = setInterval(() => {
	    fetchData();
	    // NEW: Refresh active tabs
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
    alert('SMAA Air Quality Monitoring System v1.0\n\nDeveloped for real-time air quality monitoring using AWS IoT Core.\n\nFor support, contact: support@smaa.io');
}

function showHelp() {
    alert('Dashboard Help:\n\n• Select device from dropdown\n• Auto-refresh updates every 10 seconds\n• Click sensor cards for details\n• Use chart buttons to change time range\n• Green indicator = device online\n• Red indicator = device offline');
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
    console.log('SMAA Dashboard initializing...');
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
