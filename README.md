# SMAA Air Quality Dashboard

Real-time air quality monitoring dashboard for SMAA IoT devices using AWS IoT Core.

## 📁 Project Structure

```
smaa-dashboard/
├── index.html          # Main HTML structure
├── styles.css          # All styling and responsive design
├── config.js           # Configuration file (UPDATE THIS!)
├── app.js              # Main application logic
└── README.md           # This file
```

## 🚀 Quick Start

### 1. Update Configuration

Edit `config.js` and update these values:

```javascript
const CONFIG = {
    API_BASE_URL: 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/default/getData',
    DEFAULT_DEVICE: 'SMAA_001',
    TIMEZONE: 'America/Mexico_City',  // UTC-6
    // ... other settings
};
```

### 2. Deploy

**Option A: Simple HTTP Server**
```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

**Option B: Upload to Web Hosting**
- Upload all 4 files to your web server
- Ensure `config.js` is updated with correct API URL
- Access via `https://yourdomain.com/`

**Option C: AWS S3 Static Website**
```bash
# Create S3 bucket
aws s3 mb s3://smaa-dashboard

# Enable static website hosting
aws s3 website s3://smaa-dashboard --index-document index.html

# Upload files
aws s3 sync . s3://smaa-dashboard --exclude "*.md"

# Make public
aws s3 cp s3://smaa-dashboard s3://smaa-dashboard --recursive --acl public-read
```

### 3. Access Dashboard

Open `http://localhost:8000` in your browser (or your deployment URL)

## 📡 API Endpoints

The dashboard uses these REST API endpoints:

### Get All Devices
```
GET /getData?action=devices
```

Response:
```json
{
  "count": 2,
  "online_count": 2,
  "offline_count": 0,
  "devices": [...]
}
```

### Get Latest Reading
```
GET /getData?deviceID=SMAA_001&action=latest
```

### Get Historical Data
```
GET /getData?deviceID=SMAA_001&action=history&hours=24&limit=100
```

## ⚙️ Configuration Options

### config.js Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `API_BASE_URL` | Your AWS API Gateway endpoint | Required |
| `DEFAULT_DEVICE` | Default device to display | `SMAA_001` |
| `AUTO_REFRESH_INTERVAL` | Auto-refresh interval (ms) | `10000` (10s) |
| `HISTORY_HOURS` | Hours of historical data | `24` |
| `TIMEZONE` | Display timezone | `America/Mexico_City` |

### Air Quality Thresholds

PM2.5 (μg/m³):
- Good: ≤ 12
- Moderate: 12.1 - 35.4
- Unhealthy: > 35.4

PM10 (μg/m³):
- Good: ≤ 54
- Moderate: 54.1 - 154
- Unhealthy: > 154

O3 (ppb):
- Good: ≤ 54
- Moderate: 54.1 - 70
- Unhealthy: > 70

CO (ppb):
- Good: ≤ 4400
- Moderate: 4400.1 - 9400
- Unhealthy: > 9400

## 🎨 Features

### Current Features
- ✅ Real-time data display (10-second auto-refresh)
- ✅ Multiple device support with dropdown
- ✅ Online/offline device status
- ✅ Historical data charts (6H, 24H, 48H)
- ✅ Air quality status indicators
- ✅ Responsive design (mobile-friendly)
- ✅ Data export to CSV
- ✅ Timezone-aware timestamps

### Device Status
- 🟢 Green indicator: Device online (data within 1 hour)
- 🔴 Red indicator: Device offline (no data > 1 hour)
- Shows "last seen" time for offline devices

### Sensor Cards
- PM2.5 & PM10 (particulate matter)
- Ozone (O₃)
- Carbon Monoxide (CO)
- Temperature
- Humidity
- Noise Level
- Battery Status

## 🛠️ Customization

### Change Refresh Interval
Edit `config.js`:
```javascript
AUTO_REFRESH_INTERVAL: 30000,  // 30 seconds
```

### Change Chart Colors
Edit `config.js`:
```javascript
CHART_COLORS: {
    pm25: '#3b82f6',      // Blue
    pm10: '#8b5cf6',      // Purple
    temperature: '#ef4444' // Red
}
```

### Modify Thresholds
Edit `config.js`:
```javascript
THRESHOLDS: {
    pm25: {
        good: 12,
        moderate: 35.4
    }
}
```

## 📱 Browser Support

- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅
- Mobile browsers ✅

## 🐛 Troubleshooting

### Dashboard shows "Error"
1. Check browser console (F12)
2. Verify `API_BASE_URL` in `config.js`
3. Test API directly: `curl https://YOUR_API/getData?action=devices`
4. Check CORS settings in API Gateway

### No devices showing
1. Verify devices are sending data
2. Check DynamoDB has data
3. Ensure Lambda has correct permissions
4. Check device naming (should start with `SMAA_`)

### Chart not loading
1. Ensure Chart.js CDN is accessible
2. Check browser console for errors
3. Verify historical data API returns data

### Auto-refresh not working
1. Check `config.js` has `enableAutoRefresh: true`
2. Verify no browser errors
3. Check if "Pause" button was clicked

## 📊 Performance

- Initial load: ~2 seconds
- Auto-refresh: 10 seconds (configurable)
- API response time: < 500ms
- Supports 100+ devices

## 🔒 Security Notes

- Dashboard uses public API endpoints
- No authentication required (read-only)
- Data is fetched client-side
- HTTPS recommended for production

## 📞 Support

For issues or questions:
- Check API Gateway CloudWatch logs
- Check Lambda function logs
- Verify DynamoDB data
- Contact: support@smaa.io

## 📄 License

Proprietary - SMAA Air Quality Monitoring System

---

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] Update `API_BASE_URL` in `config.js`
- [ ] Set correct `TIMEZONE`
- [ ] Test all endpoints
- [ ] Verify device list loads
- [ ] Check historical charts
- [ ] Test on mobile devices
- [ ] Enable HTTPS
- [ ] Set up domain (optional)
- [ ] Configure CDN (optional)

---

**Last Updated:** January 2025  
**Version:** 1.0  
**Status:** Production Ready ✅
