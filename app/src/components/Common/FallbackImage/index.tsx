import { useState, type ComponentProps } from 'react';

export const FallbackImage = ({ src, alt, onError, ...props }: ComponentProps<'img'>) => {
  const [error, setError] = useState(false);
  return (
    <img
      {...props}
      src={error ? '/logo.png' : src}
      alt={alt ?? ''}
      onError={(event) => {
        setError(true);
        onError?.(event);
      }}
    />
  );
};
