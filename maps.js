/**
 * SMAA Air Quality Dashboard - Maps Module (COMPLETE FIX)
 * Handles fixed location and mobile tracking maps
 */

let fixedMap = null;
let mobileMap = null;
let fixedMarker = null;
let tempMarker = null;
let mobileRoute = null;
let mobileMarkers = [];
let hotspotMarkers = [];
let routePoints = []; // CRITICAL: Store route data points globally

// Color gradients for different sensors
const SENSOR_GRADIENTS = {
    pm25: [
        { value: 0, color: '#10b981' },    // Good: Green
        { value: 12, color: '#fbbf24' },   // Moderate: Yellow
        { value: 35.4, color: '#f97316' }, // Unhealthy: Orange
        { value: 55, color: '#ef4444' }    // Very Unhealthy: Red
    ],
    pm10: [
        { value: 0, color: '#10b981' },
        { value: 54, color: '#fbbf24' },
        { value: 154, color: '#f97316' },
        { value: 250, color: '#ef4444' }
    ],
    o3: [
        { value: 0, color: '#10b981' },
        { value: 54, color: '#fbbf24' },
        { value: 70, color: '#f97316' },
        { value: 85, color: '#ef4444' }
    ],
    co: [
        { value: 0, color: '#10b981' },
        { value: 4400, color: '#fbbf24' },
        { value: 9400, color: '#f97316' },
        { value: 12400, color: '#ef4444' }
    ],
    temperature: [
        { value: 0, color: '#3b82f6' },    // Cold: Blue
        { value: 15, color: '#10b981' },   // Cool: Green
        { value: 25, color: '#fbbf24' },   // Warm: Yellow
        { value: 35, color: '#ef4444' }    // Hot: Red
    ],
    humidity: [
        { value: 0, color: '#f97316' },    // Dry: Orange
        { value: 30, color: '#fbbf24' },   // Low: Yellow
        { value: 60, color: '#10b981' },   // Comfortable: Green
        { value: 80, color: '#3b82f6' }    // Humid: Blue
    ],
    noise: [
        { value: 0, color: '#10b981' },    // Quiet: Green
        { value: 50, color: '#fbbf24' },   // Moderate: Yellow
        { value: 70, color: '#f97316' },   // Loud: Orange
        { value: 85, color: '#ef4444' }    // Very Loud: Red
    ]
};

// Helper to get color based on value and sensor
function getColorForValue(sensor, value) {
    const gradient = SENSOR_GRADIENTS[sensor] || SENSOR_GRADIENTS.pm25;
    for (let i = gradient.length - 1; i > 0; i--) {
        if (value >= gradient[i].value) return gradient[i].color;
    }
    return gradient[0].color;
}

// Helper for status info
function getStatusInfo(sensor, value) {
    const thresholds = CONFIG.THRESHOLDS[sensor] || CONFIG.THRESHOLDS.pm25;
    if (value <= thresholds.good) return { text: 'Good', class: 'status-good' };
    if (value <= thresholds.moderate) return { text: 'Moderate', class: 'status-moderate' };
    return { text: 'Unhealthy', class: 'status-unhealthy' };
}

// ==================== TAB SWITCHING ====================
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabMap = {
        'dashboard': 'dashboard-tab',
        'fixed-map': 'fixed-map-tab',
        'mobile-map': 'mobile-map-tab'
    };
    
    document.getElementById(tabMap[tabName]).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'fixed-map' && !fixedMap) initFixedMap();
    if (tabName === 'mobile-map' && !mobileMap) initMobileMap();
}

// ==================== FIXED LOCATION MAP ====================
function initFixedMap() {
    const defaultCenter = [25.709111, -100.303167]; // Monterrey, Mexico
    fixedMap = L.map('fixedMap').setView(defaultCenter, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(fixedMap);
    loadFixedDeviceLocation();
}

async function loadFixedDeviceLocation() {
    try {
        const data = await fetchLatestData();
        let gps = data.gps && data.gps.trim() !== '' ? data.gps : localStorage.getItem(`${data.deviceID}_fixed_gps`);
        const [lat, lon] = gps.split(',').map(parseFloat);
        if (lat && lon) {
            if (fixedMarker) fixedMap.removeLayer(fixedMarker);
            fixedMarker = L.marker([lat, lon], { icon: createFixedDeviceIcon(data) }).addTo(fixedMap);
            fixedMarker.bindPopup(createFixedPopup(data));
            fixedMap.setView([lat, lon], 15);
            updateFixedSidebar(data, lat, lon);
        } else {
            document.getElementById('fixedLocation').textContent = 'No GPS data available';
        }
		// Second change: Set statusText based on GPS availability
        let statusText = gps ? 'Location fixed' : 'Loading...';
        document.getElementById('locationStatus').textContent = statusText;
		
    } catch (error) {
        console.error('Error loading fixed device location:', error);
    }
}

function createFixedDeviceIcon(data) {
    const pm25 = parseFloat(data.pm25 || 0);
    const color = getColorForValue('pm25', pm25);
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="background: ${color}; width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 12px;">${data.deviceID.split('_')[1] || 'D'}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
}

function createFixedPopup(data) {
    const status = getStatusInfo('pm25', data.pm25);
    return `
        <div class="popup-content">
            <h4>${data.deviceID}</h4>
            <p>PM2.5: ${data.pm25} μg/m³ (${status.text})</p>
            <p>PM10: ${data.pm10} μg/m³</p>
            <p>Ozone: ${data.o3} ppb</p>
            <p>CO: ${data.co} ppb</p>
            <p>Temperature: ${data.temperature} °C</p>
            <p>Humidity: ${data.humidity} %</p>
            <p>Noise: ${data.noise} dBA</p>
            <p>Battery: ${data.battery} %</p>
            <p>Last Update: ${formatTimestamp(data.timestamp)}</p>
        </div>
    `;
}

function updateFixedSidebar(data, lat, lon) {
    document.getElementById('fixedDeviceName').textContent = data.deviceID;
    document.getElementById('fixedLocation').textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    document.getElementById('fixedPM25').textContent = `${data.pm25} μg/m³`;
    document.getElementById('fixedTemp').textContent = `${data.temperature} °C`;
    document.getElementById('fixedLastUpdate').textContent = formatTimestamp(data.timestamp);
}

// ==================== MOBILE TRACKING MAP ====================
function initMobileMap() {
    mobileMap = L.map('mobileMap').setView(CONFIG.mapDefault, CONFIG.mapDefault.zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(mobileMap);
    
    // Populate mobile device select (similar to dashboard)
    const mobileSelect = document.getElementById('mobileDeviceSelect');
    mobileSelect.innerHTML = '';
    allDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceID;
        const statusIcon = device.online ? '🟢' : '🔴';
        const lastSeen = device.online ? '' : ` (${device.last_seen})`;
        option.textContent = `${statusIcon} ${device.deviceID}${lastSeen}`;
        if (device.deviceID === currentDevice) option.selected = true;
        mobileSelect.appendChild(option);
    });
    
    loadMobileRoute();  // Initial load
}

async function loadMobileRoute() {
    try {
        const hours = document.getElementById('timeRange').value;
        const history = await fetchHistoricalData(hours);
        
        console.log('=== MOBILE ROUTE DEBUG ===');
        console.log('1. History length:', history.length);
        console.log('2. Sample record:', history[0]);
        
        if (history.length > 0) {
			// Sort ascending for oldest first (left to right on map)
            history.sort((a, b) => a.timestamp - b.timestamp);
			
            const points = history.filter(d => d.gps && d.gps.trim() !== '').map(d => {
                const [lat, lon] = d.gps.split(',').map(parseFloat);
                return { lat, lon, data: d };
            });
            
            console.log('3. Points with valid GPS:', points.length);
            console.log('4. First point:', points[0]);
            console.log('5. Sensor select value:', document.getElementById('sensorSelect').value);
            
            if (points.length < 2) {
                routePoints = [];
                updateMobileStats([]);  // Show fallback message
                return;
            }
            
            // CRITICAL: Store points globally
            routePoints = points;
            
            // Clear old route/markers/hotspots
            if (mobileRoute) mobileMap.removeLayer(mobileRoute);
            mobileMarkers.forEach(m => mobileMap.removeLayer(m));
            hotspotMarkers.forEach(m => mobileMap.removeLayer(m));
            mobileMarkers = [];
            hotspotMarkers = [];

            // Create route visualization
            mobileRoute = L.layerGroup().addTo(mobileMap);
            const currentSensor = document.getElementById('sensorSelect').value;
            
            // Option 1: DOTS ONLY (uncomment to use)
            // points.forEach((point, i) => {
            //     const value = parseFloat(point.data[currentSensor]) || 0;
            //     const color = getColorForValue(currentSensor, value);
            //     L.circleMarker([point.lat, point.lon], {
            //         radius: 6,
            //         color: 'white',
            //         fillColor: color,
            //         fillOpacity: 0.9,
            //         weight: 2
            //     }).bindPopup(`${currentSensor.toUpperCase()}: ${value.toFixed(1)}`).addTo(mobileRoute);
            // });
            
            // Option 2: LINES + DOTS (current - comment out if using dots only)
            for (let i = 1; i < points.length; i++) {
                const startValue = parseFloat(points[i-1].data[currentSensor]) || 0;
                const endValue = parseFloat(points[i].data[currentSensor]) || 0;
                const avgValue = (startValue + endValue) / 2;
                const color = getColorForValue(currentSensor, avgValue);
                L.polyline(
                    [[points[i-1].lat, points[i-1].lon], [points[i].lat, points[i].lon]], 
                    {color, weight: 4, opacity: 0.7}
                ).addTo(mobileRoute);
            }
            
            // FIT BOUNDS: Use points directly instead of route.getBounds()
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
            mobileMap.fitBounds(bounds);
            
            updateMobileVisualization();
            updateMobileStats(points);
        } else {
            routePoints = [];
            updateMobileStats([]);  // Fallback
            console.log('No mobile data available');
        }
    } catch (error) {
        console.error('Error loading mobile route:', error);
        routePoints = [];
        updateMobileStats([]);  // Fallback on error
    }
}

function updateMobileVisualization() {
    const sensor = document.getElementById('sensorSelect').value;
    
    // Clear existing markers
    mobileMarkers.forEach(m => mobileMap.removeLayer(m));
    hotspotMarkers.forEach(m => mobileMap.removeLayer(m));
    mobileMarkers = [];
    hotspotMarkers = [];
    
    // FIXED: Use stored routePoints instead of trying to access route layers
    if (routePoints.length === 0) {
        console.log('No route points available for visualization');
        return;
    }
    
    // Update the route colors
    if (mobileRoute) {
        mobileMap.removeLayer(mobileRoute);
    }
    mobileRoute = L.layerGroup().addTo(mobileMap);
    
    // Redraw route with new sensor colors
    for (let i = 1; i < routePoints.length; i++) {
        const startValue = parseFloat(routePoints[i-1].data[sensor]) || 0;
        const endValue = parseFloat(routePoints[i].data[sensor]) || 0;
        const avgValue = (startValue + endValue) / 2;
        const color = getColorForValue(sensor, avgValue);
        L.polyline(
            [[routePoints[i-1].lat, routePoints[i-1].lon], [routePoints[i].lat, routePoints[i].lon]], 
            {color, weight: 4, opacity: 0.7}
        ).addTo(mobileRoute);
    }
    
    // Add markers
    routePoints.forEach((point, i) => {
        const value = parseFloat(point.data[sensor]) || 0;
        const color = getColorForValue(sensor, value);
        
        // Add marker for each point
        const marker = L.circleMarker([point.lat, point.lon], {
            radius: 6,
            color: 'white',
            fillColor: color,
            fillOpacity: 0.9,
            weight: 2
        }).addTo(mobileMap);
        
        marker.bindPopup(`<b>${sensor.toUpperCase()}</b>: ${value.toFixed(1)}`);
        mobileMarkers.push(marker);
        
        // Add hotspot if value is unhealthy
        const status = getStatusInfo(sensor, value);
        if (status.text === 'Unhealthy') {
            const hotspot = L.circleMarker([point.lat, point.lon], {
                radius: 10, 
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.3,
                weight: 2
            }).addTo(mobileMap);
            hotspot.bindPopup(`⚠️ High ${sensor.toUpperCase()} hotspot: ${value.toFixed(1)}`);
            hotspotMarkers.push(hotspot);
        }
    });
    
    updateLegend(sensor);
    
    // UPDATE CHART with new sensor
    updateMobileChart(routePoints, sensor);
}

function updateLegend(sensor) {
    const legendItems = document.getElementById('legendItems');
    if (!legendItems) return; // Safety check
    
    legendItems.innerHTML = '';
    const gradient = SENSOR_GRADIENTS[sensor] || SENSOR_GRADIENTS.pm25;
    
    gradient.forEach(g => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background: ${g.color}"></div>
            <span class="legend-label">&gt;${g.value}</span>
        `;
        legendItems.appendChild(item);
    });
}

function updateMobileStats(points) {
    console.log('updateMobileStats called with', points.length, 'points'); // Debug
    
    // Get elements
    const distanceEl = document.getElementById('totalDistance');
    const pointsEl = document.getElementById('dataPoints');
    const avgEl = document.getElementById('avgExposure');
    const peakEl = document.getElementById('peakValue');
    
    if (points.length < 2) {
        if (distanceEl) distanceEl.textContent = 'No route data';
        if (pointsEl) pointsEl.textContent = 'No route data';
        if (avgEl) avgEl.textContent = 'No route data';
        if (peakEl) peakEl.textContent = 'No route data';
        return;
    }
    
    // Calculate total distance using Leaflet's distanceTo method
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
        const p1 = L.latLng(points[i-1].lat, points[i-1].lon);
        const p2 = L.latLng(points[i].lat, points[i].lon);
        totalDistance += p1.distanceTo(p2) / 1000;  // Convert to km
    }
    
    console.log('Total distance calculated:', totalDistance); // Debug
    
    if (distanceEl) distanceEl.textContent = `${totalDistance.toFixed(2)} km`;
    if (pointsEl) pointsEl.textContent = points.length;
    
    // Calculate avg and peak for selected sensor
    const sensor = document.getElementById('sensorSelect').value;
    const values = points.map(p => parseFloat(p.data[sensor]) || 0);
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const peakValue = Math.max(...values);
    
    console.log('Sensor:', sensor, 'Avg:', avgValue, 'Peak:', peakValue); // Debug
    
    if (avgEl) avgEl.textContent = avgValue.toFixed(1);
    if (peakEl) peakEl.textContent = peakValue.toFixed(1);
    
    // Update time series chart
    updateMobileChart(points, sensor);
}

// ==================== MOBILE TIME SERIES CHART ====================
function updateMobileChart(points, sensor) {
    const canvas = document.getElementById('mobileChart');
    if (!canvas) {
        console.log('Mobile chart canvas not found');
        return;
    }
    
    // Destroy existing chart if it exists
    if (window.mobileChartInstance) {
        window.mobileChartInstance.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    
    // Prepare data
    const labels = points.map(p => formatTimestamp(p.data.timestamp));
    const values = points.map(p => parseFloat(p.data[sensor]) || 0);
    
    // Get thresholds for the sensor
    const thresholds = CONFIG.THRESHOLDS[sensor] || CONFIG.THRESHOLDS.pm25;
    
    // Color each point based on threshold
    const pointColors = values.map(v => getColorForValue(sensor, v));
    const backgroundColors = values.map(v => {
        const color = getColorForValue(sensor, v);
        return color + '40'; // Add transparency
    });
    
    // Create chart
    window.mobileChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: sensor.toUpperCase(),
                data: values,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                pointRadius: 6,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 8,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                title: {
                    display: true,
                    text: `${sensor.toUpperCase()} Over Time`,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            const status = getStatusInfo(sensor, value);
                            return [
                                `${sensor.toUpperCase()}: ${value.toFixed(2)}`,
                                `Status: ${status.text}`
                            ];
                        }
                    }
                },
                annotation: {
                    annotations: {
                        goodLine: {
                            type: 'line',
                            yMin: thresholds.good,
                            yMax: thresholds.good,
                            borderColor: '#10b981',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: 'Good Threshold',
                                position: 'end',
                                backgroundColor: '#10b981',
                                color: 'white',
                                font: { size: 10 }
                            }
                        },
                        moderateLine: {
                            type: 'line',
                            yMin: thresholds.moderate,
                            yMax: thresholds.moderate,
                            borderColor: '#fbbf24',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: 'Moderate Threshold',
                                position: 'end',
                                backgroundColor: '#fbbf24',
                                color: 'white',
                                font: { size: 10 }
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Time',
                        font: { weight: 'bold' }
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        maxTicksLimit: 10
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: getSensorUnit(sensor),
                        font: { weight: 'bold' }
                    },
                    beginAtZero: true
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const point = points[index];
                    // Highlight point on map
                    mobileMap.setView([point.lat, point.lon], 16);
                    // Flash the marker
                    if (mobileMarkers[index]) {
                        mobileMarkers[index].openPopup();
                    }
                }
            }
        }
    });
}

// Helper to get sensor units
function getSensorUnit(sensor) {
    const units = {
        pm25: 'PM2.5 (μg/m³)',
        pm10: 'PM10 (μg/m³)',
        o3: 'Ozone (ppb)',
        co: 'CO (ppb)',
        temperature: 'Temperature (°C)',
        humidity: 'Humidity (%)',
        noise: 'Noise (dBA)'
    };
    return units[sensor] || sensor.toUpperCase();
}
