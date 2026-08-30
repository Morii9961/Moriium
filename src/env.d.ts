/// <reference types="astro/client" />

declare namespace App {
  interface SessionData {
    author: {
      id: number;
      name: string;
    };
    csrfToken: string;
  }
}
