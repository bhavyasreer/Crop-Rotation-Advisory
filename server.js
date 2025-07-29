const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan'); 
const path = require('path');
const fs = require('fs').promises;
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
require('dotenv').config();
const User = require('./models/User');
const axios = require('axios');

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'views')));
app.use(express.static('public'));

// Add session middleware
app.use(session({
    secret: 'your_secret_key_here',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set to true if using https
}));

mongoose.connect('mongodb://localhost:27017/croprotation')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Basic routes
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'views', 'home.html'));
    });

    app.get('/register.html', (req, res) => {
        res.sendFile(path.join(__dirname, 'views', 'register.html'));
    });
    
    app.get('/login.html', (req, res) => {
        res.sendFile(path.join(__dirname, 'views', 'login.html'));
    });

    app.get('/road_map.html', (req, res) => {
        res.sendFile(path.join(__dirname, 'views', 'road_map.html'));
    });

    app.get('/forgot-password.html', (req, res) => {
        res.sendFile(path.join(__dirname, 'views', 'forgot-password.html'));
    });

app.get('/crop-prediction', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'crop_prediction.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// User authentication routes
    app.post('/signup-form', async (req, res) => {
        try {
            const { email, password, firstName, lastName } = req.body;
            
            const user = new User({
                email,
                password,
                firstName,
                lastName,
                authType: 'local'
            });
            
            await user.save();
            res.status(201).json({ 
                message: 'Registration successful',
                redirectUrl: '/login.html'
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ message: 'Error registering user' });
        }
    });
    
    app.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            const user = await User.findOne({ email });
            
            if (!user) {
                return res.status(400).json({ message: 'User not found' });
            }
    
            if (user.password !== password) {
                return res.status(400).json({ message: 'Invalid password' });
            }
    
            res.json({ 
                message: 'Login successful',
                redirectUrl: '/dashboard.html',
                user: {
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    createdAt: user.createdAt
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'Error logging in' });
        }
    });

// Dataset loading function
async function loadCropDataset() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'views', 'crop_rotation_updated_dataset.csv'), 'utf-8');
        const lines = data.trim().split('\n');
        
        // Skip header and parse records
        const records = lines.slice(1).map(line => {
            const [
                n, p, k, temperature, humidity, ph, rainfall,
                previous_crop, soil_type, water_requirement,
                investment_per_acre, crop_duration, label,
                previous_crop_profit_per_acre, predicted_crop_profit_per_acre
            ] = line.split(',').map(val => val.trim());

            return {
                previous_crop,
                soil_type,
                water_requirement,
                crop_duration,
                investment_per_acre: parseFloat(investment_per_acre),
                label, // This is the recommended next crop
                predicted_profit: parseFloat(predicted_crop_profit_per_acre)
            };
        });

        console.log('Dataset loaded:', records.length, 'records');
        console.log('Sample record:', records[0]);
        return records;
    } catch (error) {
        console.error('Error loading dataset:', error);
        throw error;
    }
}

// Crop prediction endpoint
app.post('/predict-crop', async (req, res) => {
    try {
        console.log('Received request at Node:', req.body);

        // Validate input data
        const formData = {
            n: parseFloat(req.body.n),
            p: parseFloat(req.body.p),
            k: parseFloat(req.body.k),
            temperature: parseFloat(req.body.temperature),
            humidity: parseFloat(req.body.humidity),
            ph: parseFloat(req.body.ph),
            rainfall: parseFloat(req.body.rainfall)
        };

        // Check for invalid values
        Object.entries(formData).forEach(([key, value]) => {
            if (isNaN(value)) {
                throw new Error(`Invalid value for ${key}`);
            }
        });

        console.log('Sending to Flask:', formData);

        const modelResponse = await axios.post('http://localhost:5000/predict', formData, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log('Response from Flask:', modelResponse.data);

        if (!modelResponse.data.success) {
            throw new Error(modelResponse.data.error || 'Prediction failed');
        }

        res.json({
            success: true,
            recommendations: modelResponse.data.predictions
        });

    } catch (error) {
        console.error('Prediction error:', error.message);
        res.json({
            success: false,
            message: 'Error making prediction: ' + error.message
        });
    }
});

// Helper functions
function calculateAverageInvestment(crop, dataset) {
    const records = dataset.filter(r => r.label === crop);
    if (records.length === 0) return 0;
    return Math.round(records.reduce((sum, r) => sum + r.investment_per_acre, 0) / records.length);
}

function calculateAverageProfit(crop, dataset) {
    const records = dataset.filter(r => r.label === crop);
    if (records.length === 0) return 0;
    return Math.round(records.reduce((sum, r) => sum + r.predicted_profit, 0) / records.length);
}

function countCropOccurrences(crop, dataset) {
    return dataset.filter(r => r.label === crop).length;
}

// Get previous crops endpoint
app.get('/get-previous-crops', async (req, res) => {
    try {
        const data = await fs.readFile(path.join(__dirname, 'views', 'crop_rotation_updated_dataset.csv'), 'utf-8');
        const lines = data.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const previousCropIndex = headers.indexOf('previous_crop');
        const labelIndex = headers.indexOf('label');

        const uniqueCrops = new Set();
        lines.slice(1).forEach(line => {
            const values = line.split(',').map(v => v.trim());
            if (values[previousCropIndex]) uniqueCrops.add(values[previousCropIndex]);
            if (values[labelIndex]) uniqueCrops.add(values[labelIndex]);
        });

        const allCrops = Array.from(uniqueCrops).sort();

        res.json({
            success: true,
            crops: allCrops
        });
    } catch (error) {
        console.error('Error getting crops:', error);
        res.json({
            success: false,
            message: 'Error loading crops: ' + error.message
        });
    }
});

const client = new OAuth2Client('1008796212013-aj90vpg0vlk4g10p6m9hjob0kcuvlchv.apps.googleusercontent.com');

// Google Authentication Route
app.post('/auth/google', async (req, res) => {
    try {
        const { credential } = req.body;
        
        // Verify the Google token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: '1008796212013-aj90vpg0vlk4g10p6m9hjob0kcuvlchv.apps.googleusercontent.com'
        });
        
        const payload = ticket.getPayload();
        console.log('Google payload:', payload); // Debug log

        // First try to find user by googleId
        let user = await User.findOne({ email: payload.email });
        console.log('Found user:', user); // Debug log

        if (!user) {
            // Create new user
            user = new User({
                firstName: payload.given_name,
                lastName: payload.family_name,
                email: payload.email,
                googleId: payload.sub,
                authType: 'google'
            });

            try {
                await user.save();
                console.log('New user created:', user); // Debug log
            } catch (saveError) {
                console.error('Error saving user:', saveError);
                throw saveError;
            }
        } else {
            // Update existing user with Google info if needed
            user.googleId = payload.sub;
            user.authType = 'google';
            await user.save();
        }

        // Create session
        req.session.userId = user._id;
        
        res.json({
            success: true,
            user: {
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName
            },
            redirectUrl: '/dashboard.html'
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(400).json({
            success: false,
            message: 'Authentication failed: ' + error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    });