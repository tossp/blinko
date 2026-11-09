import { Button, Modal } from '@heroui/react';

import { observer } from 'mobx-react-lite';
import { DialogStore } from '.';
import { RootStore } from '@/store/root';
import { useHistoryBack, useIsIOS } from '@/lib/hooks';
import { useMediaQuery } from 'usehooks-ts';
import { motion } from 'motion/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { CancelIcon } from '@/components/Common/Icons';

const CloseButton = ({ onClose }: { onClose: () => void }) => (
  <motion.div
    onClick={onClose}
    className={`cursor-pointer absolute
    md:top-[-12px] md:right-[-12px] top-[-20px] right-[calc(50%-17.5px)] bg-background border-2 border-border z-[2002] text-foreground p-2 rounded-full
    !w-[35px] !h-[35px] flex items-center justify-center shadow-lg`}
    whileTap={{
      scale: 0.85,
      backgroundColor: 'var(--secondbackground)',
    }}
    whileHover={{
      scale: 1.1,
      backgroundColor: 'var(--hover)',
    }}
    transition={{
      type: 'spring',
      stiffness: 400,
      damping: 17,
    }}
  >
    <motion.div
      whileTap={{ rotate: 90 }}
      whileHover={{ rotate: 45 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <CancelIcon className="primary-foreground !transition-all" />
    </motion.div>
  </motion.div>
);

const Dialog = observer(() => {
  const modal = RootStore.Get(DialogStore);
  const isPc = useMediaQuery('(min-width: 768px)');
  const {
    className,
    classNames,
    isOpen,
    placement,
    title,
    size,
    content,
    isDismissable,
    onlyContent = false,
    noPadding = false,
    showOnlyContentCloseButton = false,
    transparent = false,
  } = modal;
  const Content = typeof content === 'function' ? content : () => content;
  const isIOS = useIsIOS();
  useHistoryBack({
    state: isOpen,
    onStateChange: () => modal.close(),
    historyState: 'modal',
  });

  const motionConfig: import('motion/react').HTMLMotionProps<'div'> = {
    initial: 'enter',
    animate: 'enter',
    exit: 'exit',
    variants: {
      enter: {
        y: 0,
        opacity: 1,
        transition: { type: 'spring', bounce: 0.5, duration: 0.6 },
      },
      exit: {
        y: -20,
        opacity: 0,
        transition: { type: 'spring', bounce: 0.5, duration: 0.3 },
      },
    },
  };

  const containerClass = isPc
    ? 'fixed inset-0 z-[2001] flex justify-center items-center pointer-events-none max-w-screen-2xl mx-auto left-0 right-0'
    : 'fixed bottom-0 left-0 right-0 z-[2001] flex flex-col items-center pointer-events-none';

  const modalSizeClass = (() => {
    const baseClass = 'mx-auto ';
    switch (size) {
      case 'xs':
        return baseClass + 'w-1/4';
      case 'sm':
        return baseClass + 'w-1/3';
      case 'md':
        return baseClass + 'w-1/2';
      case 'lg':
        return baseClass + 'w-2/3';
      case 'xl':
        return baseClass + 'w-3/4';
      case '2xl':
        return baseClass + 'w-4/5';
      case '3xl':
        return baseClass + 'w-5/6';
      case '4xl':
        return baseClass + 'w-11/12';
      case '5xl':
        return baseClass + 'w-full';
      case 'full':
        return baseClass + 'w-full';
      default:
        return baseClass + 'w-full';
    }
  })();

  if (isIOS && isOpen) {
    return (
      <>
        <div
          className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm"
          onClick={() => {
            if (isDismissable) {
              modal.close();
            }
          }}
        />
        <motion.div
          className={`${containerClass} ${isPc ? modalSizeClass : ''} `}
          {...motionConfig}
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
        >
          {!onlyContent && (
            <motion.div
              className="w-full bg-background border-secondbackground p-1 rounded-t-lg shadow-lg pointer-events-auto"
              {...motionConfig}
            >
              <div className="flex flex-col justify-between items-center p-2 gap-2 w-full">
                <div className="flex gap-2 w-full items-center">
                  <div className="text-lg font-semibold">{title ?? ''}</div>
                  <Button isIconOnly variant="ghost" onPress={() => modal.close()} className="ml-auto">
                    <Icon icon="tabler:x" width="16" height="16" />
                  </Button>
                </div>
                <div className="w-full">
                  <Content />
                </div>
              </div>
            </motion.div>
          )}
          {onlyContent && (
            <motion.div className="w-full pointer-events-auto " {...motionConfig}>
              <div className="relative w-full">
                {showOnlyContentCloseButton && <CloseButton onClose={() => modal.close()} />}
                <div className="w-full">
                  <Content />
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </>
    );
  }
  return (
    <Modal.Backdrop
      style={{ zIndex: 2000 }}
      isOpen={isOpen}
      isDismissable={isDismissable}
      variant="blur"
      className={classNames?.backdrop}
      onOpenChange={(open) => {
        if (open) modal.preventClose = false;
        else if (!modal.preventClose) modal.close();
      }}
    >
      <Modal.Container
        size={size === 'full' ? 'full' : 'lg'}
        placement={
          placement === 'top' || placement === 'top-center'
            ? 'top'
            : placement === 'bottom' || placement === 'bottom-center'
              ? 'bottom'
              : placement
        }
      >
        <Modal.Dialog
          aria-label={title || 'Dialog'}
          className={[
            className,
            classNames?.base,
            transparent ? 'bg-transparent' : '',
            size !== 'full'
              ? {
                  xs: 'max-w-xs',
                  sm: 'max-w-sm',
                  md: 'max-w-md',
                  lg: 'max-w-lg',
                  xl: 'max-w-xl',
                  '2xl': 'max-w-2xl',
                  '3xl': 'max-w-3xl',
                  '4xl': 'max-w-4xl',
                  '5xl': 'max-w-5xl',
                }[size]
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!onlyContent && size !== 'full' && <Modal.CloseTrigger className={classNames?.closeButton} />}
          {onlyContent ? (
            <>
              {showOnlyContentCloseButton && (
                <div className="relative shrink-0">
                  <CloseButton onClose={() => modal.close()} />
                </div>
              )}
              <Modal.Body className="modal-content">
                <Content />
              </Modal.Body>
            </>
          ) : (
            <>
              {title && (
                <Modal.Header className={classNames?.header}>
                  <Modal.Heading>{title}</Modal.Heading>
                </Modal.Header>
              )}
              <Modal.Body className={[noPadding ? '' : 'p-2 md:p-4', classNames?.body].filter(Boolean).join(' ')}>
                <Content />
              </Modal.Body>
            </>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
});

export default Dialog;
