import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';

interface LoadingAndEmptyProps {
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
  isAbsolute?: boolean;
}

export const LoadingAndEmpty = ({ isLoading, isEmpty, emptyMessage, className, isAbsolute = true }: LoadingAndEmptyProps) => {
  const { t } = useTranslation();

  return (
    <div className={`text-ignore flex flex-col items-center justify-center gap-1 w-full ${className}`}>
      <div className={`mt-2 mb-[-5px] w-[40px] !transition-all ${isLoading ? 'h-[30px]' : 'h-0'}`}>
        {isLoading && <Icon icon="eos-icons:three-dots-loading" width="40" height="30" />}
      </div>
      {isEmpty && (
        <div className={`${isAbsolute ? 'absolute top-[40%]' : ''} select-none text-ignore flex items-center justify-center gap-2 w-full mt-2 md:mt-10`}>
          <Icon icon="line-md:coffee-half-empty-twotone-loop" width="24" height="24" />
          <div className='text-md text-ignore font-bold'>
            {emptyMessage || t('no-data-here-well-then-time-to-write-a-note')}
          </div>
        </div>
      )}
    </div>
  );
}; 