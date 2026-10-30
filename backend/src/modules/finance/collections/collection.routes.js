const express = require('express');
const router = express.Router();
const { db } = require('../../../config/database.config');
const { enhancedCheckFinance } = require('../../../middleware/auth.middleware');

module.exports = router;
