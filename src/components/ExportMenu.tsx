import { useState, useRef, useEffect } from 'react';
import { Download } from 'lucide-react';
import './ExportMenu.css';

// Metric format types for export
type MetricFormat = 'currency' | 'currency_precise' | 'percent' | 'number' | 'multiplier' | 'decimal';

const METRIC_FORMATS: Record<string, MetricFormat> = {
  totalRevenue: 'currency',
  totalPurchases: 'number',
  conversionRate: 'percent',
  aov: 'currency',
  uniqueCustomers: 'number',
  sessions: 'number',
  adSpend: 'currency',
  roas: 'multiplier',
  cac: 'currency',
  transactionFees: 'currency',
  netProfit: 'currency',
  leads: 'number',
  costPerLead: 'currency_precise',
  leadRate: 'percent',
  linkClicks: 'number',
  cpc: 'currency_precise',
  costPerLinkClick: 'currency_precise',
  uniqueLinkClicks: 'number',
  costPerUniqueLinkClick: 'currency_precise',
  linkCtr: 'percent',
  uniqueLinkCtr: 'percent',
  impressions: 'number',
  reach: 'number',
  cpm: 'currency_precise',
  frequency: 'decimal',
  postEngagements: 'number',
  cpe: 'currency_precise',
  landingPageViews: 'number',
  costPerLandingPageView: 'currency_precise',
  addToCart: 'number',
  costPerAddToCart: 'currency_precise',
  initiateCheckout: 'number',
  costPerInitiateCheckout: 'currency_precise',
  videoViews: 'number',
  costPerVideoView: 'currency_precise',
};

export function formatMetricForExport(metricId: string, value: number): string {
  const format = METRIC_FORMATS[metricId] || 'number';

  if (value === 0 || (isNaN(value) && format !== 'number')) {
    // For currency/multiplier, show dash for zero (matches dashboard display)
    if (['currency', 'currency_precise', 'multiplier'].includes(format)) return '—';
  }

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case 'currency_precise':
      return value > 0
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(value)
        : '—';
    case 'percent':
      return value > 0 ? `${value.toFixed(2)}%` : '—';
    case 'multiplier':
      return value > 0 ? `${value.toFixed(2)}x` : '—';
    case 'decimal':
      return value > 0 ? value.toFixed(2) : '—';
    case 'number':
      return new Intl.NumberFormat('en-US').format(value);
    default:
      return String(value);
  }
}

interface MetricForExport {
  id: string;
  label: string;
}

interface ExportMenuProps {
  stats: Record<string, number>;
  visibleMetrics: MetricForExport[];
  dateRangeLabel: string;
  accountName?: string;
}

function generateCSV(
  stats: Record<string, number>,
  visibleMetrics: MetricForExport[],
  dateRangeLabel: string,
  accountName?: string,
): string {
  const rows: string[][] = [];

  // Header row
  rows.push(['Metric', 'Value']);

  // Metadata rows
  rows.push(['Date Range', dateRangeLabel]);
  if (accountName) {
    rows.push(['Ad Account', accountName]);
  }
  rows.push(['Exported', new Date().toLocaleString('en-US')]);
  rows.push([]); // blank separator

  // Metric rows
  for (const metric of visibleMetrics) {
    const value = stats[metric.id] ?? 0;
    const formatted = formatMetricForExport(metric.id, value);
    rows.push([metric.label, formatted]);
  }

  return rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getExportFilename(extension: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `convertra-report-${date}.${extension}`;
}

export default function ExportMenu({
  stats,
  visibleMetrics,
  dateRangeLabel,
  accountName,
}: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleExportCSV = () => {
    const csv = generateCSV(stats, visibleMetrics, dateRangeLabel, accountName);
    downloadFile(csv, getExportFilename('csv'), 'text/csv;charset=utf-8;');
    setIsOpen(false);
  };

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const grid = document.querySelector('.stats-grid') as HTMLElement;
      if (!grid) {
        console.error('Stats grid not found for PDF export');
        return;
      }

      const canvas = await html2canvas(grid, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();

      // Header
      pdf.setFontSize(18);
      pdf.setTextColor(30, 41, 59); // --text-primary
      pdf.text('Dashboard Report', 14, 18);

      pdf.setFontSize(10);
      pdf.setTextColor(71, 85, 105); // --text-secondary
      const headerLine = accountName
        ? `${dateRangeLabel} · ${accountName}`
        : dateRangeLabel;
      pdf.text(headerLine, 14, 26);

      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184); // --text-muted
      pdf.text(`Exported ${new Date().toLocaleString('en-US')}`, 14, 32);

      // Metrics grid image
      const imgWidth = pageWidth - 28; // 14mm margins
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 14, 38, imgWidth, imgHeight);

      // Footer
      const footerY = pdf.internal.pageSize.getHeight() - 8;
      pdf.setFontSize(7);
      pdf.setTextColor(148, 163, 184);
      pdf.text('Generated by ConversionIQ™ · convertraiq.com', 14, footerY);

      pdf.save(getExportFilename('pdf'));
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setPdfLoading(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="export-menu" ref={menuRef}>
      <button
        className="export-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Export dashboard data"
        title="Export"
      >
        <Download size={16} strokeWidth={1.5} />
        <span className="export-menu-trigger-label">Export</span>
      </button>

      {isOpen && (
        <div className="export-menu-dropdown">
          <button className="export-menu-item" onClick={handleExportCSV}>
            <span className="export-menu-item-icon">CSV</span>
            <div className="export-menu-item-content">
              <span className="export-menu-item-label">Export as CSV</span>
              <span className="export-menu-item-desc">Spreadsheet-compatible</span>
            </div>
          </button>
          <button
            className="export-menu-item"
            onClick={handleExportPDF}
            disabled={pdfLoading}
          >
            <span className="export-menu-item-icon">PDF</span>
            <div className="export-menu-item-content">
              <span className="export-menu-item-label">
                {pdfLoading ? 'Generating...' : 'Export as PDF'}
              </span>
              <span className="export-menu-item-desc">Branded report</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
