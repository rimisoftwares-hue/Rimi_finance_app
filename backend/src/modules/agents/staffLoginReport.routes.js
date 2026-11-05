/**
 * staffLoginReport.routes.js
 *
 * Routes for Staff Login Report.
 */

const express = require('express');
const router = express.Router();
const controller = require('./staffLoginReport.controller');

// GET / (mounted at /agents/login-report in router index)
router.get('/', controller.getReport);

module.exports = router;

