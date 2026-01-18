const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Auto-save endpoint
app.post('/api/save-data', (req, res) => {
    try {
        const data = req.body;
        const filePath = path.join(__dirname, 'music-theory-data.json');
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        
        res.json({ success: true, message: 'Data saved successfully' });
    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Auto-save endpoint: POST /api/save-data');
});
