// USA Tax Calculator (2025) - Educational estimator (not tax advice)

// Currency formatter
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// 2025 standard deduction (commonly published IRS figures)
const STD_DEDUCTION_2025 = {
  single: 15750,
  mfs: 15750,
  mfj: 31500,
  hoh: 23625,
};

// 2025 ordinary income tax brackets (SINGLE is filled; others fallback to SINGLE for now)
const ORDINARY_BRACKETS_2025 = {
  single: [
    { rate: 0.10, from: 0,      to: 11925 },
    { rate: 0.12, from: 11925,  to: 48475 },
    { rate: 0.22, from: 48475,  to: 103350 },
    { rate: 0.24, from: 103350, to: 197300 },
    { rate: 0.32, from: 197300, to: 250525 },
    { rate: 0.35, from: 250525, to: 626350 },
    { rate: 0.37, from: 626350, to: Infinity },
  ],
  mfj: null,
  hoh: null,
  mfs: null,
};

// LTCG thresholds (0%/15%/20%) - used for "like SmartEMIcalc" behavior
// You can update these annually.
const LTCG_2025 = {
  single: { r0_to: 48350, r15_to: 533400 },
  mfj:    { r0_to: 96700, r15_to: 600050 },
  hoh:    { r0_to: 64750, r15_to: 566700 },
  mfs:    { r0_to: 48350, r15_to: 300000 }, // simplified
};

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function clampNonNeg(v) {
  return Math.max(v, 0);
}

function setWarn(msg) {
  const box = document.getElementById('warnBox');
  if (!msg) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }
  box.style.display = 'block';
  box.textContent = msg;
}

function calcOrdinaryTax(taxableOrdinary, status) {
  const brackets = ORDINARY_BRACKETS_2025[status] || ORDINARY_BRACKETS_2025.single;
  const rows = [];
  let tax = 0;

  for (const b of brackets) {
    const taxedAmount = clampNonNeg(Math.min(taxableOrdinary, b.to) - b.from);
    const bracketTax = taxedAmount * b.rate;

    rows.push({
      label: `${Math.round(b.rate * 100)}%`,
      taxedAmount,
      rate: b.rate,
      tax: bracketTax,
    });

    tax += bracketTax;
  }

  return { tax, rows };
}

function calcLtcgTax(totalTaxableIncome, ltcg, status) {
  const t = LTCG_2025[status] || LTCG_2025.single;
  const rows = [];

  // Ordinary taxable portion is everything except LTCG (because we tax LTCG separately)
  const ordinaryTaxable = totalTaxableIncome - ltcg;

  // Room for 0% LTCG: up to r0_to minus ordinary taxable
  const room0 = Math.max(t.r0_to - ordinaryTaxable, 0);
  const taxedAt0 = Math.min(ltcg, room0);

  const remainingAfter0 = ltcg - taxedAt0;

  // Room for 15% LTCG: from r0_to to r15_to (depends on ordinary)
  const start15 = Math.max(ordinaryTaxable, t.r0_to);
  const room15 = Math.max(t.r15_to - start15, 0);
  const taxedAt15 = Math.min(remainingAfter0, room15);

  const taxedAt20 = Math.max(remainingAfter0 - taxedAt15, 0);

  rows.push({ rate: 0.00, amount: taxedAt0, tax: 0 });
  rows.push({ rate: 0.15, amount: taxedAt15, tax: taxedAt15 * 0.15 });
  rows.push({ rate: 0.20, amount: taxedAt20, tax: taxedAt20 * 0.20 });

  const tax = (taxedAt15 * 0.15) + (taxedAt20 * 0.20);
  return { tax, rows };
}

function renderOrdinaryRows(rows) {
  const tbody = document.getElementById('bracketRows');
  tbody.innerHTML = '';

  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.label}</td>
      <td>${fmt.format(r.taxedAmount)}</td>
      <td>${Math.round(r.rate * 100)}%</td>
      <td>${fmt.format(r.tax)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderLtcgRows(rows) {
  const tbody = document.getElementById('ltcgRows');
  tbody.innerHTML = '';

  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${Math.round(r.rate * 100)}%</td>
      <td>${fmt.format(r.amount)}</td>
      <td>${fmt.format(r.tax)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function calculate() {
  const status = document.getElementById('status').value;

  // Auto-fill standard deduction
  const deductionVal = STD_DEDUCTION_2025[status] ?? STD_DEDUCTION_2025.single;
  document.getElementById('deduction').value = deductionVal;

  // Inputs
  const gross = n(document.getElementById('gross').value);
  const withheld = n(document.getElementById('withheld').value);
  const k401 = n(document.getElementById('k401').value);
  const otherDed = n(document.getElementById('otherDed').value);
  const stcg = n(document.getElementById('stcg').value);
  const ltcg = n(document.getElementById('ltcg').value);

  // Adjusted W-2 approximation (what Box 1 roughly represents)
  let adjustedW2 = gross - k401 - otherDed;

  // Warnings / sanity checks
  setWarn('');
  if (adjustedW2 < 0) {
    setWarn("Your deductions (401k + other) are greater than your gross salary. Check inputs.");
    adjustedW2 = 0;
  }

  // Totals
  const totalIncome = adjustedW2 + stcg + ltcg;
  const taxableIncome = clampNonNeg(totalIncome - deductionVal);

  // Ordinary income = taxable income minus LTCG (tax LTCG separately)
  const taxableOrdinary = clampNonNeg(taxableIncome - ltcg);

  // Tax calculations
  const ordinary = calcOrdinaryTax(taxableOrdinary, status);
  const capgains = calcLtcgTax(taxableIncome, ltcg, status);

  const totalTax = ordinary.tax + capgains.tax;
  const refund = withheld - totalTax;

  // Render KPIs
  document.getElementById('adjustedW2').textContent = fmt.format(adjustedW2);
  document.getElementById('totalIncome').textContent = fmt.format(totalIncome);
  document.getElementById('taxableIncome').textContent = fmt.format(taxableIncome);
  document.getElementById('totalTax').textContent = fmt.format(totalTax);

  const refundEl = document.getElementById('refund');
  const hintEl = document.getElementById('refundHint');
  refundEl.textContent = fmt.format(refund);

  if (refund >= 0) {
    hintEl.textContent = 'Refund (you overpaid withholding).';
    refundEl.style.color = 'var(--good)';
  } else {
    hintEl.textContent = 'Amount due (you underpaid withholding).';
    refundEl.style.color = 'var(--bad)';
  }

  // Tables
  renderOrdinaryRows(ordinary.rows);
  renderLtcgRows(capgains.rows);

  // Small notice if they picked MFJ/HOH/MFS (since ordinary brackets fallback to Single in this version)
  if (status !== 'single') {
    setWarn("Note: Ordinary income brackets currently use Single brackets as a fallback. Standard deduction and LTCG thresholds use your selected status. If you want full accuracy for MFJ/HOH/MFS, add those bracket tables.");
  }
}

function init() {
  const statusEl = document.getElementById('status');
  const deductionEl = document.getElementById('deduction');

  function updateDeduction() {
    const s = statusEl.value;
    deductionEl.value = STD_DEDUCTION_2025[s] ?? STD_DEDUCTION_2025.single;
  }

  statusEl.addEventListener('change', updateDeduction);
  document.getElementById('calcBtn').addEventListener('click', calculate);

  updateDeduction();
}

init();