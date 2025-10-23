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
let historyChart = null;
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

    // NEW: GPS buffering for accurate fixed location (after 5 points)
    const deviceKey = data.deviceID;
    let gpsBuffer = JSON.parse(localStorage.getItem(`${deviceKey}_gps_buffer`) || '[]');
    let previousMode = localStorage.getItem(`${deviceKey}_previous_mode`) || null;

    if (data.mode == 1 && data.gps && data.gps.trim() !== '') {
        const [lat, lon] = data.gps.split(',').map(parseFloat);
        gpsBuffer.push({lat, lon});
        if (gpsBuffer.length > 5) gpsBuffer = gpsBuffer.slice(-5);  // Keep last 5
        localStorage.setItem(`${deviceKey}_gps_buffer`, JSON.stringify(gpsBuffer));
        localStorage.setItem(`${deviceKey}_previous_mode`, '1');
        console.log(`Buffered GPS for ${deviceKey} in mode 1: ${data.gps} (buffer size: ${gpsBuffer.length})`);
    }

    // Detect transition: If previous was 1 and now 0, average if buffer has 5 points
    if (previousMode == '1' && data.mode == 0 && gpsBuffer.length === 5) {
        const avgLat = gpsBuffer.reduce((sum, p) => sum + p.lat, 0) / 5;
        const avgLon = gpsBuffer.reduce((sum, p) => sum + p.lon, 0) / 5;
        const avgGPS = `${avgLat.toFixed(6)},${avgLon.toFixed(6)}`;
        localStorage.setItem(`${deviceKey}_fixed_gps`, avgGPS);
        localStorage.removeItem(`${deviceKey}_gps_buffer`);  // Clear buffer
        localStorage.removeItem(`${deviceKey}_previous_mode`);
        console.log(`Stored averaged fixed GPS for ${deviceKey} after transition: ${avgGPS}`);
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

// ==================== CHART MANAGEMENT ====================
function updateChart(data) {
    if (!data || data.length === 0) return;

    const labels = data.map(d => formatTimestamp(d.timestamp));

    const datasets = [
        {
            label: 'PM2.5 (μg/m³)',
            data: data.map(d => d.pm25),
            borderColor: CONFIG.CHART_COLORS.pm25,
            backgroundColor: CONFIG.CHART_COLORS.pm25 + '20',
            tension: 0.4,
            yAxisID: 'y'
        },
        {
            label: 'PM10 (μg/m³)',
            data: data.map(d => d.pm10),
            borderColor: CONFIG.CHART_COLORS.pm10,
            backgroundColor: CONFIG.CHART_COLORS.pm10 + '20',
            tension: 0.4,
            yAxisID: 'y'
        },
        {
            label: 'Ozone (ppb)',
            data: data.map(d => d.o3),
            borderColor: CONFIG.CHART_COLORS.o3,
            backgroundColor: CONFIG.CHART_COLORS.o3 + '20',
            tension: 0.4,
            yAxisID: 'y'
        },
        {
            label: 'CO (ppb)',
            data: data.map(d => d.co),
            borderColor: CONFIG.CHART_COLORS.co,
            backgroundColor: CONFIG.CHART_COLORS.co + '20',
            tension: 0.4,
            yAxisID: 'y2'  // Separate axis if scale differs
        },
        {
            label: 'Temperature (°C)',
            data: data.map(d => d.temperature),
            borderColor: CONFIG.CHART_COLORS.temperature,
            backgroundColor: CONFIG.CHART_COLORS.temperature + '20',
            tension: 0.4,
            yAxisID: 'y'
        },
        {
            label: 'Humidity (%)',
            data: data.map(d => d.humidity),
            borderColor: CONFIG.CHART_COLORS.humidity,
            backgroundColor: CONFIG.CHART_COLORS.humidity + '20',
            tension: 0.4,
            yAxisID: 'y'
        },
        {
            label: 'Noise (dBA)',
            data: data.map(d => d.noise),
            borderColor: CONFIG.CHART_COLORS.noise,
            backgroundColor: CONFIG.CHART_COLORS.noise + '20',
            tension: 0.4,
            yAxisID: 'y'
        },
        {
            label: 'Battery (%)',
            data: data.map(d => d.battery),
            borderColor: CONFIG.CHART_COLORS.battery,
            backgroundColor: CONFIG.CHART_COLORS.battery + '20',
            tension: 0.4,
            yAxisID: 'y'
        }
    ];

    if (historyChart) historyChart.destroy();
    const ctx = document.getElementById('historyChart').getContext('2d');
    historyChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { beginAtZero: true, position: 'left' },
                y2: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } },
                x: { grid: { color: 'rgba(0, 0, 0, 0.05)' } }
            }
        }
    });
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
    
    refreshTimer = setInterval(fetchData, CONFIG.AUTO_REFRESH_INTERVAL);
    
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
