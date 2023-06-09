type Message = {
  [key: string]: string | Message;
};

export type Resources = {
  [language: string]: {
    [namespace: string]: {
      [key: string]: Message;
    };
  };
};

export type Outliers = {
  [key: string]: string[];
};
