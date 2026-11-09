import { PhotoProvider, PhotoView } from 'react-photo-view';
import { getBlinkoFileUrl } from '@/lib/blinkoEndpoint';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';

interface ImageWrapperProps {
  src?: string;
  width?: number | string;
  height?: number | string;
  alt?: string;
}

export const ImageWrapper = ({ src = '', width, height, alt }: ImageWrapperProps) => {
  const props = { width, height, alt: alt ?? '' };
  if (!src) return null;
  const imageUrl = getBlinkoFileUrl(src, { token: RootStore.Get(UserStore).tokenData.value?.token });

  return (
    <div className="markdown-image-wrapper w-full">
      <PhotoProvider>
        <PhotoView src={imageUrl}>
          <img src={imageUrl} className="w-full max-h-[200px] object-cover" {...props} />
        </PhotoView>
      </PhotoProvider>
    </div>
  );
};
