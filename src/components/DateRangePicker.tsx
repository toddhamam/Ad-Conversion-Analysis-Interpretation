import { useState, useRef, useEffect } from 'react';
import type { DatePreset } from '../services/metaApi';
import './DateRangePicker.css';

interface DateRangeValue {
  preset?: DatePreset;
  startDate: Date;
  endDate: Date;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: 'last_7d' },
  { label: 'Last 14 days', value: 'last_14d' },
  { label: 'Last 28 days', value: 'last_28d' },
  { label: 'Last 30 days', value: 'last_30d' },
  { label: 'This week', value: 'this_week' },
  { label: 'Last week', value: 'last_week' },
  { label: 'This month', value: 'this_month' },
  { label: 'Last month', value: 'last_month' },
  { label: 'Maximum', value: 'maximum' },
];

function getPresetDates(preset: DatePreset): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  let startDate = new Date(today);

  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      startDate.setDate(startDate.getDate() - 1);
      endDate.setDate(endDate.getDate() - 1);
      break;
    case 'last_7d':
      startDate.setDate(startDate.getDate() - 6);
      break;
    case 'last_14d':
      startDate.setDate(startDate.getDate() - 13);
      break;
    case 'last_28d':
      startDate.setDate(startDate.getDate() - 27);
      break;
    case 'last_30d':
      startDate.setDate(startDate.getDate() - 29);
      break;
    case 'this_week':
      startDate.setDate(startDate.getDate() - startDate.getDay());
      break;
    case 'last_week':
      startDate.setDate(startDate.getDate() - startDate.getDay() - 7);
      endDate.setDate(endDate.getDate() - endDate.getDay() - 1);
      break;
    case 'this_month':
      startDate.setDate(1);
      break;
    case 'last_month':
      startDate.setDate(1);
      startDate.setMonth(startDate.getMonth() - 1);
      endDate.setDate(0); // Last day of previous month
      break;
    case 'maximum':
      startDate.setFullYear(startDate.getFullYear() - 2); // 2 years back
      break;
  }

  return { startDate, endDate };
}

function formatDateRange(startDate: Date, endDate: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = startDate.toLocaleDateString('en-US', options);
  const endStr = endDate.toLocaleDateString('en-US', options);

  if (startDate.getTime() === endDate.getTime()) {
    return startStr;
  }
  return `${startStr} - ${endStr}`;
}

function getPresetLabel(preset?: DatePreset): string {
  if (!preset) return 'Custom';
  const found = PRESETS.find(p => p.value === preset);
  return found?.label || 'Custom';
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<DatePreset | undefined>(value.preset);
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = new Date(value.startDate);
    d.setMonth(d.getMonth() - 1);
    return d;
  });
  const [rightMonth, setRightMonth] = useState(() => new Date(value.startDate));
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset temp values when opening
  useEffect(() => {
    if (isOpen) {
      setTempStartDate(value.startDate);
      setTempEndDate(value.endDate);
      setSelectedPreset(value.preset);
    }
  }, [isOpen, value]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handlePresetClick = (preset: DatePreset) => {
    const { startDate, endDate } = getPresetDates(preset);
    setSelectedPreset(preset);
    setTempStartDate(startDate);
    setTempEndDate(endDate);
  };

  const handleDayClick = (date: Date) => {
    setSelectedPreset(undefined); // Clear preset when selecting custom dates

    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      // Start new selection
      setTempStartDate(date);
      setTempEndDate(null);
    } else {
      // Complete selection
      if (date < tempStartDate) {
        setTempEndDate(tempStartDate);
        setTempStartDate(date);
      } else {
        setTempEndDate(date);
      }
    }
  };

  const handleUpdate = () => {
    if (tempStartDate && tempEndDate) {
      onChange({
        preset: selectedPreset,
        startDate: tempStartDate,
        endDate: tempEndDate,
      });
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const delta = direction === 'prev' ? -1 : 1;
    setLeftMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + delta);
      return newDate;
    });
    setRightMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + delta);
      return newDate;
    });
  };

  return (
    <div className="date-range-picker" ref={dropdownRef}>
      <button
        className="date-range-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg className="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="date-range-label">
          {getPresetLabel(value.preset)}: {formatDateRange(value.startDate, value.endDate)}
        </span>
        <svg className="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="date-range-dropdown">
          <div className="date-range-content">
            <div className="presets-sidebar">
              <div className="presets-label">Date range</div>
              {PRESETS.map(preset => (
                <button
                  key={preset.value}
                  className={`preset-button ${selectedPreset === preset.value ? 'active' : ''}`}
                  onClick={() => handlePresetClick(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="calendars-container">
              <Calendar
                month={leftMonth}
                selectedStart={tempStartDate}
                selectedEnd={tempEndDate}
                onDayClick={handleDayClick}
                onNavigate={() => navigateMonth('prev')}
                showPrevNav
              />
              <Calendar
                month={rightMonth}
                selectedStart={tempStartDate}
                selectedEnd={tempEndDate}
                onDayClick={handleDayClick}
                onNavigate={() => navigateMonth('next')}
                showNextNav
              />
            </div>
          </div>

          <div className="date-range-footer">
            <div className="selected-range">
              {tempStartDate && tempEndDate
                ? formatDateRange(tempStartDate, tempEndDate)
                : tempStartDate
                ? `${tempStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - Select end date`
                : 'Select date range'}
            </div>
            <div className="footer-buttons">
              <button className="cancel-button" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className="update-button"
                onClick={handleUpdate}
                disabled={!tempStartDate || !tempEndDate}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CalendarProps {
  month: Date;
  selectedStart: Date | null;
  selectedEnd: Date | null;
  onDayClick: (date: Date) => void;
  onNavigate: () => void;
  showPrevNav?: boolean;
  showNextNav?: boolean;
}

function Calendar({ month, selectedStart, selectedEnd, onDayClick, onNavigate, showPrevNav, showNextNav }: CalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthName = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: (Date | null)[] = [];

  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }

  // Add all days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, monthIndex, i));
  }

  const isInRange = (date: Date) => {
    if (!selectedStart || !selectedEnd) return false;
    return date >= selectedStart && date <= selectedEnd;
  };

  const isSelected = (date: Date) => {
    if (selectedStart && date.getTime() === selectedStart.getTime()) return true;
    if (selectedEnd && date.getTime() === selectedEnd.getTime()) return true;
    return false;
  };

  const isRangeStart = (date: Date) => {
    return selectedStart && date.getTime() === selectedStart.getTime();
  };

  const isRangeEnd = (date: Date) => {
    return selectedEnd && date.getTime() === selectedEnd.getTime();
  };

  return (
    <div className="calendar">
      <div className="calendar-header">
        {showPrevNav && (
          <button className="nav-button" onClick={onNavigate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <span className="month-label">{monthName}</span>
        {showNextNav && (
          <button className="nav-button" onClick={onNavigate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      <div className="calendar-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="weekday">{day}</div>
        ))}
      </div>

      <div className="calendar-days">
        {days.map((date, index) => (
          <div
            key={index}
            className={`day ${date ? '' : 'empty'} ${date && isSelected(date) ? 'selected' : ''} ${date && isInRange(date) ? 'in-range' : ''} ${date && isRangeStart(date) ? 'range-start' : ''} ${date && isRangeEnd(date) ? 'range-end' : ''} ${date && date > today ? 'future' : ''}`}
            onClick={() => date && date <= today && onDayClick(date)}
          >
            {date?.getDate()}
          </div>
        ))}
      </div>
    </div>
  );
}
