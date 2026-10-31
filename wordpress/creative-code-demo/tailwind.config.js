/** Same design tokens as the demo (Tailwind CDN config), compiled instead of loaded at runtime. */
module.exports = {
  content: ['./*.php', './inc/**/*.php', './template-parts/**/*.php', './assets/js/*.js'],
  theme: {
    extend: {
      colors: { accent: '#680bd6', dark: '#0A0A0A', navy: '#151525' },
      fontFamily: { sans: ['Rubik', 'sans-serif'] },
    },
  },
};
