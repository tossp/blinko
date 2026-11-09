import { Avatar, Button, Tabs } from '@heroui/react';

import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';

export type TabItem = {
  key: string;
  title: string | React.ReactNode;
  icon?: string;
  avatar?: string;
};

interface ScrollableTabsProps {
  items: TabItem[];
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  color?: 'primary' | 'secondary' | 'default' | 'success' | 'warning' | 'danger';
  classNames?: {
    base?: string;
    tabList?: string;
    tab?: string;
    cursor?: string;
  };
}

export const ScrollableTabs = ({
  items,
  selectedKey,
  onSelectionChange,
  color = 'primary',
  classNames = {},
}: ScrollableTabsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const { t } = useTranslation();
  const selectedColors = {
    primary: ['data-[selected=true]:text-primary-foreground', 'bg-primary'],
    secondary: ['data-[selected=true]:text-secondary-foreground', 'bg-secondary'],
    default: ['data-[selected=true]:text-default-foreground', 'bg-default'],
    success: ['data-[selected=true]:text-success-foreground', 'bg-success'],
    warning: ['data-[selected=true]:text-warning-foreground', 'bg-warning'],
    danger: ['data-[selected=true]:text-danger-foreground', 'bg-danger'],
  }[color];
  const checkScroll = () => {
    if (!containerRef.current) return;
    const tabList = containerRef.current.querySelector('[role="tablist"]');
    if (!tabList) return;

    const { scrollLeft, scrollWidth, clientWidth } = tabList as HTMLElement;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    const timer = setTimeout(checkScroll, 100);

    const tabList = containerRef.current?.querySelector('[role="tablist"]');
    if (tabList) {
      tabList.addEventListener('scroll', checkScroll);
    }

    window.addEventListener('resize', checkScroll);

    return () => {
      clearTimeout(timer);
      if (tabList) {
        tabList.removeEventListener('scroll', checkScroll);
      }
      window.removeEventListener('resize', checkScroll);
    };
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;
    const tabList = containerRef.current.querySelector('[role="tablist"]');
    if (!tabList) return;

    const scrollAmount = 200;
    (tabList as HTMLElement).scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const renderTabTitle = (item: TabItem) => {
    const titleText = typeof item.title === 'string' ? t(item.title) : item.title;

    if (item.avatar) {
      return (
        <div className="flex items-center space-x-2">
          <Avatar size="sm" className="rounded-full w-5 h-5">
            <Avatar.Image src={item.avatar} alt={''} />
            <Avatar.Fallback>{''}</Avatar.Fallback>
          </Avatar>
          <span className="text-sm">{titleText}</span>
        </div>
      );
    } else if (item.icon) {
      return (
        <div className="flex items-center space-x-2">
          <Icon icon={item.icon} width="18" />
          <span className="text-sm">{titleText}</span>
        </div>
      );
    } else {
      return titleText;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {showLeftArrow && (
        <Button
          isIconOnly
          variant="ghost"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background/60 backdrop-blur-sm"
          size="sm"
          onPress={() => scroll('left')}
        >
          <Icon icon="tabler:chevron-left" width="18" />
        </Button>
      )}
      <Tabs
        selectedKey={selectedKey}
        onSelectionChange={(key) => onSelectionChange(String(key))}
        className={classNames.base}
      >
        <Tabs.List
          aria-label="Scrollable tabs"
          className={
            'gap-2 relative p-2 w-full bg-transparent text-foreground overflow-x-auto scroll-smooth ' +
            (classNames.tabList || '')
          }
        >
          {items.map((item) => (
            <Tabs.Tab
              key={item.key}
              id={item.key}
              className={['max-w-fit px-3 h-10 rounded-xl', selectedColors[0], classNames.tab].filter(Boolean).join(' ')}
            >
              {renderTabTitle(item)}
              <Tabs.Indicator className={['shadow-md rounded-xl', selectedColors[1], classNames.cursor].filter(Boolean).join(' ')} />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {showRightArrow && (
        <Button
          isIconOnly
          variant="ghost"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-background/60 backdrop-blur-sm"
          size="sm"
          onPress={() => scroll('right')}
        >
          <Icon icon="tabler:chevron-right" width="18" />
        </Button>
      )}
    </div>
  );
};
