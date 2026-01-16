import './Badge.css';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'winning' | 'testing' | 'fatigued' | 'high' | 'medium' | 'low' | 'coming-soon' | 'tag';
}

const Badge = ({ children, variant = 'tag' }: BadgeProps) => {
  return (
    <span className={`badge badge-${variant}`}>
      {children}
    </span>
  );
};

export default Badge;
