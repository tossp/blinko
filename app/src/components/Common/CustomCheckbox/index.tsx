import { Checkbox, Chip } from '@heroui/react';
import type { ComponentProps } from 'react';

export const CustomCheckbox = ({ children, ...props }: ComponentProps<typeof Checkbox>) => (
  <Checkbox {...props}>
    {(state) => (
      <Checkbox.Content>
        <Chip
          color="accent"
          variant={state.isSelected ? 'primary' : 'tertiary'}
          className={
            state.isSelected
              ? 'border-2 border-primary bg-primary text-primary-foreground'
              : 'border-2 border-default hover:bg-primary/20'
          }
        >
          <Chip.Label>
            {typeof children === 'function' ? children(state) : children || (state.isSelected ? 'Enabled' : 'Disabled')}
          </Chip.Label>
        </Chip>
      </Checkbox.Content>
    )}
  </Checkbox>
);
