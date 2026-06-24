declare module 'qr-code-styling' {
  export type DotType =
    | 'square'
    | 'dots'
    | 'rounded'
    | 'extra-rounded'
    | 'classy'
    | 'classy-rounded';

  export type CornerSquareType = 'square' | 'dot' | 'extra-rounded';
  export type CornerDotType = 'square' | 'dot';

  export type Extension = 'png' | 'jpeg' | 'webp' | 'svg';

  export type Options = {
    width?: number;
    height?: number;
    type?: 'canvas' | 'svg';
    data?: string;
    margin?: number;
    qrOptions?: {
      typeNumber?: number;
      mode?: string;
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    };
    dotsOptions?: {
      type?: DotType;
      color?: string;
    };
    cornersSquareOptions?: {
      type?: CornerSquareType;
      color?: string;
    };
    cornersDotOptions?: {
      type?: CornerDotType;
      color?: string;
    };
    backgroundOptions?: {
      color?: string;
    };
  };

  export default class QRCodeStyling {
    constructor(options: Options);
    append(container: HTMLElement): void;
    update(options: Options): void;
    download(downloadOptions: { name: string; extension: Extension }): Promise<void>;
    getRawData(extension: Extension): Promise<Blob>;
  }
}
