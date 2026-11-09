import React, { useEffect, useRef } from 'react';
import { Markmap } from '@markmap/view';
import { parse } from '@markmap/parse';

export const MarkmapWrapper = ({ content }: { content: string }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      svgRef.current.setAttribute('width', '800');
      svgRef.current.setAttribute('height', '600');
      const { root } = parse(content);
      const mm = Markmap.create(svgRef.current, root);
      mm.fit();
      return () => mm.destroy();
    }
  }, [content]);

  return (
    <div className="w-full overflow-auto">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};
