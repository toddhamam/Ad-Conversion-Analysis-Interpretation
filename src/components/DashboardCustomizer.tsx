import { useState, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Settings, X } from 'lucide-react';
import './DashboardCustomizer.css';

export interface MetricConfig {
  id: string;
  label: string;
  visible: boolean;
}

interface DashboardCustomizerProps {
  metrics: MetricConfig[];
  onMetricsChange: (metrics: MetricConfig[]) => void;
}

interface SortableItemProps {
  metric: MetricConfig;
  onToggle: (id: string) => void;
}

function SortableItem({ metric, onToggle }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metric.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`customizer-item ${!metric.visible ? 'customizer-item-hidden' : ''}`}
    >
      <button
        className="customizer-drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical size={18} />
      </button>
      <span className="customizer-item-label">{metric.label}</span>
      <label className="customizer-toggle">
        <input
          type="checkbox"
          checked={metric.visible}
          onChange={() => onToggle(metric.id)}
        />
        <span className="customizer-toggle-slider"></span>
      </label>
    </div>
  );
}

export default function DashboardCustomizer({ metrics, onMetricsChange }: DashboardCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = metrics.findIndex((m) => m.id === active.id);
      const newIndex = metrics.findIndex((m) => m.id === over.id);
      const newMetrics = arrayMove(metrics, oldIndex, newIndex);
      onMetricsChange(newMetrics);
    }
  }

  function handleToggle(id: string) {
    const newMetrics = metrics.map((m) =>
      m.id === id ? { ...m, visible: !m.visible } : m
    );
    onMetricsChange(newMetrics);
  }

  return (
    <div className="customizer-container">
      <button
        ref={buttonRef}
        className={`customizer-button ${isOpen ? 'customizer-button-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Customize dashboard"
      >
        <Settings size={20} />
        <span>Customize</span>
      </button>

      {isOpen && (
        <div ref={panelRef} className="customizer-panel">
          <div className="customizer-header">
            <h3 className="customizer-title">Customize Dashboard</h3>
            <button
              className="customizer-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <p className="customizer-subtitle">Drag to reorder. Toggle to show/hide.</p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={metrics.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="customizer-list">
                {metrics.map((metric) => (
                  <SortableItem
                    key={metric.id}
                    metric={metric}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
