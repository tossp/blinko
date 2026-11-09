import { autoSizeTextArea } from '@/lib/autoSizeTextArea';
import { Input, Switch, TextArea, TextField, Tooltip } from '@heroui/react';
import { observer } from "mobx-react-lite";

import { useTranslation } from "react-i18next";
import { Item, ItemWithTooltip, SelectDropdown } from "./Item";
import ThemeSwitcher from "../Common/Theme/ThemeSwitcher";
import { ThemeColor } from "../Common/Theme/ThemeColor";
import LanguageSwitcher from "../Common/LanguageSwitcher";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { PageSize, PromiseCall } from "@/store/standard/PromiseState";
import { api } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useMediaQuery } from "usehooks-ts";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { GradientBackground } from "../Common/GradientBackground";
import { UserStore } from "@/store/user";
import { BaseStore } from "@/store/baseStore";
import FontSwitcher from "../Common/FontSwitcher";

export const PerferSetting = observer(() => {
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const blinko = RootStore.Get(BlinkoStore)
  const base = RootStore.Get(BaseStore)
  const [textLength, setTextLength] = useState(blinko.config.value?.textFoldLength?.toString() || '500');
  const [maxHomePageWidth, setMaxHomePageWidth] = useState(blinko.config.value?.maxHomePageWidth?.toString() || '0');
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState(blinko.config.value?.customBackgroundUrl || '');
  const [signinFooterText, setSigninFooterText] = useState(blinko.config.value?.signinFooterText || '');
  const [customTitle, setCustomTitle] = useState(blinko.config.value?.customTitle || '');
  const user = RootStore.Get(UserStore)

  useEffect(() => {
    blinko.config.call();
    setTextLength(blinko.config.value?.textFoldLength?.toString() || '500');
    setMaxHomePageWidth(blinko.config.value?.maxHomePageWidth?.toString() || '0');
    setCustomBackgroundUrl(blinko.config.value?.customBackgroundUrl || '');
    setSigninFooterText(blinko.config.value?.signinFooterText || '');
    setCustomTitle(blinko.config.value?.customTitle || '');
  }, [blinko.config.value?.textFoldLength, blinko.config.value?.maxHomePageWidth, blinko.config.value?.customBackgroundUrl, blinko.config.value?.signinFooterText, blinko.config.value?.customTitle]);


  return <CollapsibleCard
    icon="tabler:brush"
    title={t('preference')}
  >
    <Item
      leftContent={<>{t('theme')}</>}
      rightContent={<ThemeSwitcher onChange={async value => {
        return await PromiseCall(api.config.update.mutate({
          key: 'theme',
          value: value
        }))
      }} />} />
    <Item
      leftContent={<>{t('theme-color')}</>}
      rightContent={<ThemeColor
        value={blinko.config.value?.themeColor}
        onChange={async (background, foreground) => {
          await PromiseCall(api.config.update.mutate({
            key: 'themeColor',
            value: background
          }), { autoAlert: false })
          await PromiseCall(api.config.update.mutate({
            key: 'themeForegroundColor',
            value: foreground
          }))

          const darkElement = document.querySelector('.dark')
          if (darkElement) {
            //@ts-ignore
            darkElement.style.setProperty('--primary', background || "#f9f9f9")
            //@ts-ignore
            darkElement.style.setProperty('--primary-foreground', foreground || "#000000")
          }

          const lightElement = document.querySelector('.light')
          if (lightElement) {
            //@ts-ignore
            lightElement.style.setProperty('--primary', background || "black")
            //@ts-ignore
            lightElement.style.setProperty('--primary-foreground', foreground || "hsl(210 40% 98%)")
          }
        }}
      />} />
    <Item
      leftContent={<>{t('language')}</>}
      rightContent={<LanguageSwitcher value={blinko.config.value?.language} onChange={value => {
        PromiseCall(api.config.update.mutate({
          key: 'language',
          value: value
        }))
      }} />} />

    <Item
      leftContent={<>{t('default-home-page')}</>}
      rightContent={
        <SelectDropdown
          value={blinko.config.value?.defaultHomePage}
          placeholder={t('select-default-home-page')}
          options={base.routerList
            .filter(route => route.href === '/' || route.href.startsWith('/?path='))
            .map(route => ({
              key: route.href === '/' ? 'blinko' : route.href.split('=')[1],
              label: t(route.title)
            }))}
          onChange={async (value) => {
            await PromiseCall(api.config.update.mutate({
              key: 'defaultHomePage',
              value: value
            }))
          }}
        />
      } />

    <Item
      leftContent={<>{t('hide-notification')}</>}
      rightContent={<Switch isSelected={blinko.config.value?.isHiddenNotification} onChange={e => {
          PromiseCall(api.config.update.mutate({
            key: 'isHiddenNotification',
            value: e
          }))
        }}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch>} />

    <Item
      leftContent={<>{t('show-navigation-bar-on-mobile')}</>}
      rightContent={<Switch isSelected={blinko.config.value?.isHiddenMobileBar} onChange={e => {
          PromiseCall(api.config.update.mutate({
            key: 'isHiddenMobileBar',
            value: e
          }))
        }}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch>} />

    <Item
      leftContent={<>{t('hide-comments-in-card')}</>}
      rightContent={<Switch isSelected={blinko.config.value?.isHideCommentInCard} onChange={e => {
          PromiseCall(api.config.update.mutate({
            key: 'isHideCommentInCard',
            value: e
          }))
        }}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch>} />

    <Item
      leftContent={<>{t('order-by-create-time')}</>}
      rightContent={<Switch isSelected={blinko.config.value?.isOrderByCreateTime} onChange={e => {
          PromiseCall(api.config.update.mutate({
            key: 'isOrderByCreateTime',
            value: e
          }))
        }}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch>} />

    <Item
      leftContent={<div className="flex flex-col">
        <div>{t('max-home-page-width')}</div>
        <div className="text-xs text-default-400">{t('max-home-page-width-tip')}</div>
      </div>}
      rightContent={
        <div className="flex items-center gap-2">
          <TextField value={maxHomePageWidth} className={'w-20'}><Input type="number" onChange={e => setMaxHomePageWidth(e.target.value)} onBlur={e => {
              const value = parseInt(e.target.value);
              if (!isNaN(value)) {
                PromiseCall(api.config.update.mutate({
                  key: 'maxHomePageWidth',
                  value: value
                }));
              }
            }} min={0} /></TextField>
          <span className="text-sm text-default-400">px</span>
        </div>
      }
    />

    <Item
      leftContent={<ItemWithTooltip
        content={t('text-fold-length')}
        toolTipContent={<div className="w-[300px] flex gap-2 py-4 px-2">
          <div className="min-w-[80px] min-h-[80px] bg-default-100 rounded-lg"></div>
          <div className="flex flex-col gap-2 flex-1">
            <div className="text-md font-medium">{t('title-first-line-of-the-text')}</div>
            <div className="text-sm text-default-400 line-clamp-2">{t('content-rest-of-the-text-if-the-text-is-longer-than-the-length')}</div>
          </div>
        </div>}
      />}
      rightContent={
        <div className="flex items-center gap-2">
          <TextField value={textLength} className={'w-20'}><Input type="number" onChange={e => setTextLength(e.target.value)} onBlur={e => {
              const value = parseInt(e.target.value);
              if (!isNaN(value)) {
                PromiseCall(api.config.update.mutate({
                  key: 'textFoldLength',
                  value: value
                }));
              }
            }} min={0} /></TextField>
          <span className="text-sm text-default-400">{t('chars')}</span>
        </div>
      }
    />

    <Item
      leftContent={<>{t('close-daily-review')}</>}
      rightContent={
        <Switch isSelected={blinko.config.value?.isCloseDailyReview} onChange={e => {
            PromiseCall(api.config.update.mutate({
              key: 'isCloseDailyReview',
              value: e
            }))
          }}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch>
      } />

    <Item
      type={isPc ? 'row' : 'col'}
      leftContent={<ItemWithTooltip content={t('device-card-columns')} toolTipContent={<div className="w-[300px] flex flex-col gap-2">
        <div>{t('columns-for-different-devices')}</div>
      </div>} />}
      rightContent={<div className="flex gap-2 w-full justify-end">
        <SelectDropdown
          value={blinko.config.value?.smallDeviceCardColumns}
          placeholder={t('mobile')}
          icon="proicons:phone"
          options={[
            { key: "1", label: "1" },
            { key: "2", label: "2" }
          ]}
          onChange={async (value) => {
            await PromiseCall(api.config.update.mutate({
              key: 'smallDeviceCardColumns',
              value: value
            }))
          }}
        />
        <SelectDropdown
          value={blinko.config.value?.mediumDeviceCardColumns}
          placeholder={t('tablet')}
          icon="tabler:device-ipad"
          options={[
            { key: "1", label: "1" },
            { key: "2", label: "2" },
            { key: "3", label: "3" },
            { key: "4", label: "4" },
          ]}
          onChange={async (value) => {
            await PromiseCall(api.config.update.mutate({
              key: 'mediumDeviceCardColumns',
              value: value
            }))
          }}
        />
        <SelectDropdown
          value={blinko.config.value?.largeDeviceCardColumns}
          placeholder={t('desktop')}
          icon="ic:outline-tv"
          options={[
            { key: "1", label: "1" },
            { key: "2", label: "2" },
            { key: "3", label: "3" },
            { key: "4", label: "4" },
            { key: "5", label: "5" },
            { key: "6", label: "6" },
            { key: "7", label: "7" },
            { key: "8", label: "8" },
          ]}
          onChange={async (value) => {
            await PromiseCall(api.config.update.mutate({
              key: 'largeDeviceCardColumns',
              value: value
            }))
          }}
        />
      </div>}
    />

    <Item
      leftContent={<>{t('time-format')}</>}
      rightContent={
        <SelectDropdown
          value={blinko.config.value?.timeFormat}
          placeholder={t('select-a-time-format')}
          icon="mingcute:time-line"
          options={[
            { key: "relative", label: "1 seconds ago" },
            { key: "YYYY-MM-DD", label: "2024-01-01" },
            { key: "YYYY-MM-DD HH:mm", label: "2024-01-01 15:30" },
            { key: "HH:mm", label: "15:30" },
            { key: "YYYY-MM-DD HH:mm:ss", label: "2024-01-01 15:30:45" },
            { key: "MM-DD HH:mm", label: "03-20 15:30" },
            { key: "MMM DD, YYYY", label: "Mar 20, 2024" },
            { key: "MMM DD, YYYY HH:mm", label: "Mar 20, 2024 15:30" },
            { key: "YYYY-MM-DD, dddd", label: "2024-01-01, Monday" },
            { key: "dddd, MMM DD, YYYY", label: "Monday, Mar 20, 2024" },
          ]}
          onChange={async (value) => {
            await PromiseCall(api.config.update.mutate({
              key: 'timeFormat',
              value: value
            }))
          }}
        />
      } />


    <Item
      leftContent={<>{t('page-size')}</>}
      rightContent={
        <TextField value={PageSize.value}><Input type="number" min="10" max="100" onChange={e => {
            PageSize.save(Number(e.target.value))
          }} /></TextField>
      } />
    <Item
      leftContent={<>{t('font-style')}</>}
      rightContent={
        <FontSwitcher fontname={blinko.config.value?.fontStyle} onChange={async fontname => {
          await PromiseCall(api.config.update.mutate({
            key: 'fontStyle',
            value: fontname
          }))
          // Refresh config to update UI
          await blinko.config.call()
        }} />
      }
    />
    <Item
      leftContent={<>{t('toolbar-visibility')}</>}
      rightContent={
        <SelectDropdown
          value={blinko.config.value?.toolbarVisibility}
          placeholder={t('select-toolbar-visibility')}
          icon="mdi:toolbar"
          options={[
            { key: "always-show-toolbar", label: t('always-show-toolbar') },
            { key: "hide-toolbar-on-mobile", label: t('hide-toolbar-on-mobile') },
            { key: "always-hide-toolbar", label: t('always-hide-toolbar') }
          ]}
          onChange={async (value) => {
            await PromiseCall(api.config.update.mutate({
              key: 'toolbarVisibility',
              value: value
            }))
          }}
        />
      } />
    <Item
      leftContent={<>{t('use-blinko-hub')}</>}
      rightContent={
        <Switch isSelected={blinko.config.value?.isUseBlinkoHub} onChange={async e => {
            await PromiseCall(api.config.update.mutate({
              key: 'isUseBlinkoHub',
              value: e
            }))
            window.location.reload()
          }}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch>
      } />

    <Item
      leftContent={<>{t('close-background-animation')}</>}
      rightContent={
        <Tooltip><Tooltip.Trigger tabIndex={0}><Switch isSelected={blinko.config.value?.isCloseBackgroundAnimation} onChange={e => {
              PromiseCall(api.config.update.mutate({
                key: 'isCloseBackgroundAnimation',
                value: e
              }))
            }}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch></Tooltip.Trigger><Tooltip.Content>{<GradientBackground className="rounded-lg w-[200px] h-[100px]">
          <div ></div>
        </GradientBackground>}</Tooltip.Content></Tooltip>
      } />

    {
      user.isSuperAdmin && (
        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={<div className="flex flex-col">
            <div>{t('custom-title')}</div>
            <div className="text-xs text-default-400">{t('custom-title-tip')}</div>
          </div>}
          rightContent={<TextField value={customTitle} className={"w-full md:w-[400px]"}><Input placeholder={t('custom-title-placeholder')} type="text" maxLength={50} onChange={e => {
              setCustomTitle(e.target.value)
            }} onBlur={async () => {
              const titleValue = customTitle.trim().slice(0, 50);
              setCustomTitle(titleValue);
              await PromiseCall(api.config.update.mutate({
                key: 'customTitle',
                value: titleValue
              }));
              blinko.config.call();
            }} /></TextField>} />
      )
    }

    {
      user.isSuperAdmin && (
        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={<div className="flex flex-col">


            <div>{t('custom-background-url')}</div>
            <div className="text-xs text-default-400">{t('custom-bg-tip')}</div>
          </div>}
          rightContent={<TextField value={customBackgroundUrl} className={"w-full md:w-[400px]"}><Input placeholder="https://www.shadergradient.co/customize?" type="text" onChange={e => {
              setCustomBackgroundUrl(e.target.value)
            }} onBlur={e => {
              PromiseCall(api.config.update.mutate({
                key: 'customBackgroundUrl',
                value: customBackgroundUrl
              }), { autoAlert: false })
            }} /></TextField>} />
      )
    }

    {
      user.isSuperAdmin && (
        <Item
          leftContent={<>{t('enable-signin-footer')}</>}
          rightContent={
            <Switch isSelected={blinko.config.value?.signinFooterEnabled ?? false} onChange={async (e) => {
                await PromiseCall(api.config.update.mutate({
                  key: 'signinFooterEnabled',
                  value: e
                }));
                blinko.config.call();
              }}><Switch.Content><Switch.Control><Switch.Thumb></Switch.Thumb></Switch.Control></Switch.Content></Switch>
          }
        />
      )
    }

    {
      user.isSuperAdmin && (
        <Item
          type="col"
          leftContent={
            <div className="flex flex-col gap-1">
              <div>{t('signin-footer-text')}</div>
              <div className="text-xs text-default-400">{t('signin-footer-desc')}</div>
            </div>
          }
          rightContent={
            <TextField value={signinFooterText} className={["w-full", 'rounded-'+"lg"].filter(Boolean).join(' ')}><TextArea ref={(element) => {  if (element) return autoSizeTextArea(element, { minRows: 3, maxRows: 8 }); }} maxLength={1000} onChange={(e) => setSigninFooterText(e.target.value)} onBlur={async () => {
                await PromiseCall(api.config.update.mutate({
                  key: 'signinFooterText',
                  value: signinFooterText
                }));
                blinko.config.call();
              }} placeholder={t('signin-footer-placeholder')} rows={3} /></TextField>
          }
        />
      )
    }
  </CollapsibleCard>
})
