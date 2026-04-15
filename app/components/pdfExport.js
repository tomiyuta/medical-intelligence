'use client';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ASCII-safe text helper: replace CJK chars with placeholder for jsPDF default font
function safeText(str) {
  if (!str) return '';
  return String(str).replace(/[^\x00-\x7F]/g, '?');
}

export function generateScoringPDF(facilities, options = {}) {
  const { title = 'Priority Target List', prefecture = 'All', date = new Date().toISOString().slice(0,10) } = options;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica');

  // Header
  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text('MedIntel', 14, 15);
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Medical Intelligence Platform', 14, 20);

  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(safeText(title), 14, 32);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`${safeText(prefecture)} | ${date} | Tier S/A/B ${facilities.length} facilities`, 14, 38);

  const tierCounts = {};
  facilities.forEach(f => { tierCounts[f.tier] = (tierCounts[f.tier]||0) + 1; });
  const confCounts = {};
  facilities.forEach(f => { confCounts[f.confidence||'-'] = (confCounts[f.confidence||'-']||0) + 1; });

  let y = 44;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Tiers: ${Object.entries(tierCounts).map(([k,v])=>`${k}: ${v}`).join(' | ')}`, 14, y);
  doc.text(`Confidence: ${Object.entries(confCounts).map(([k,v])=>`${k}: ${v}`).join(' | ')}`, 14, y + 4);
  y += 12;

  const headers = [['#','Score','Tier','Facility','Prefecture','Beds','Cases','Conf','Reasons','Missing']];
  const rows = facilities.map((f, i) => [
    i + 1,
    f.priority_score || f.score || '',
    f.tier || '',
    safeText(f.facility_name || f.name || ''),
    safeText(f.prefecture_name || f.pref || ''),
    f.total_beds || f.beds || '',
    f.annual_cases || f.cases || '',
    f.confidence || '',
    safeText((f.reasons || []).join(', ') || '-'),
    safeText((f.missing || []).join(', ') || '-'),
  ]);

  autoTable(doc, {
    startY: y,
    head: headers,
    body: rows,
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 8 }, 1: { cellWidth: 12 }, 2: { cellWidth: 10 },
      3: { cellWidth: 55 }, 4: { cellWidth: 22 }, 5: { cellWidth: 14 },
      6: { cellWidth: 16 }, 7: { cellWidth: 14 }, 8: { cellWidth: 50 },
      9: { cellWidth: 45 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    const footY = doc.internal.pageSize.height - 8;
    doc.text('MedIntel | Source: MHLW/MIC/IPSS Open Data (PDL1.0) | Not created by the government.', 14, footY);
    doc.text(`Page ${i} / ${pageCount}`, doc.internal.pageSize.width - 30, footY);
  }

  doc.save(`medintel_report_${date}.pdf`);
}

export function generateKijunPDF(facilities, options = {}) {
  const { prefecture = '', date = new Date().toISOString().slice(0,10) } = options;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica');

  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text('MedIntel', 14, 15);
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Facility Standards Report', 14, 20);

  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(`${safeText(prefecture)} - Facility Standards`, 14, 32);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`${facilities.length} facilities | ${date} | Source: Regional Health Bureaus`, 14, 38);

  const headers = [['Code','Facility','Address','Beds','Stds','Score','Tier','Conf']];
  const rows = facilities.slice(0, 200).map(f => [
    f.code || '',
    safeText(f.name || ''),
    safeText(f.addr || ''),
    f.beds || f.beds_text || '',
    f.std_count || '',
    f.score || '',
    f.tier || '',
    (() => {
      const cov = [f.addr, f.beds||f.beds_text, f.score, f.tier].filter(Boolean).length;
      return cov >= 3 ? 'High' : cov >= 2 ? 'Medium' : 'Low';
    })(),
  ]);

  autoTable(doc, {
    startY: 44,
    head: headers,
    body: rows,
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 18 }, 1: { cellWidth: 60 }, 2: { cellWidth: 55 },
      3: { cellWidth: 18 }, 4: { cellWidth: 16 }, 5: { cellWidth: 14 },
      6: { cellWidth: 12 }, 7: { cellWidth: 14 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    const footY = doc.internal.pageSize.height - 8;
    doc.text('MedIntel | Source: Regional Health Bureau Open Data (PDL1.0) | Not created by the government.', 14, footY);
    doc.text(`Page ${i} / ${pageCount}`, doc.internal.pageSize.width - 30, footY);
  }

  console.log('KIJUN_PDF: generating', facilities.length, 'facilities,', pageCount, 'pages');
  doc.save(`medintel_kijun_${date}.pdf`);
  console.log('KIJUN_PDF: doc.save() completed');
}
