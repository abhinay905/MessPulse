import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  elevated = false,
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${
        elevated ? 'glass-panel-elevated' : 'glass-panel'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
