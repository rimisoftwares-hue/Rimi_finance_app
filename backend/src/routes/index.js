const express = require('express');
const router = express.Router();

const { enhancedCheckFinance } = require('../middleware/auth.middleware');



// ─── Accounting: Ledger ───────────────────────────────────────────────────────
const ledgerRoutes = require('../modules/accounting/ledger/ledger.routes');
router.use('/ledger', enhancedCheckFinance, ledgerRoutes);

// ─── Accounting: Ledger Groups ────────────────────────────────────────────────
const ledgerGroupRoutes = require('../modules/accounting/ledgerGroup/group.routes');
router.use('/ledger-groups', enhancedCheckFinance, ledgerGroupRoutes);

// ─── Authentication ───────────────────────────────────────────────────────────
const authRoutes = require('../modules/auth/auth.routes');
router.use('/auth', authRoutes);

// ─── Finance: Profile & Company Management ────────────────────────────────────
const financeRoutes = require('../modules/finance/finance.routes');
router.use('/finance', financeRoutes);

// ─── Dashboard ────────────────────────────────────────────────────────────────
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
router.use('/dashboard', dashboardRoutes);

// ─── Vehicles ─────────────────────────────────────────────────────────────────
const vehicleRoutes = require('../modules/finance/vehicles/vehicle.routes');
router.use('/vehicles', vehicleRoutes);
router.get('/vehicle-info', vehicleRoutes.getVehicleInfo);

// ─── Customers ────────────────────────────────────────────────────────────────
const customerRoutes = require('../modules/customers/customer.routes');
router.use('/customers', customerRoutes);

// ─── Payments ─────────────────────────────────────────────────────────────────
const paymentRoutes = require('../modules/finance/payments/payment.routes');
router.use('/payments', paymentRoutes);

// ─── Office Expenses ──────────────────────────────────────────────────────────
const expenseRoutes = require('../modules/expenses/expense.routes');
router.use('/expenses', expenseRoutes);

// ─── Godowns ──────────────────────────────────────────────────────────────────
const godownRoutes = require('../modules/finance/inventory/godown/godown.routes');
router.use('/godowns', enhancedCheckFinance, godownRoutes);

// ─── Accounting: Vouchers ─────────────────────────────────────────────────────
const voucherRoutes = require('../modules/accounting/vouchers/voucher.routes');
router.use('/vouchers', enhancedCheckFinance, voucherRoutes);

// ─── Accounting: Reports ──────────────────────────────────────────────────────
const reportsRoutes = require('../modules/accounting/reports/reports.routes');
router.use('/reports', enhancedCheckFinance, reportsRoutes);

module.exports = router;


