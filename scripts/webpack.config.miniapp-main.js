'use strict';

const path = require('path');
const webpack = require('webpack');
const common = require('./webpack.config.common');

module.exports = {
  ...common,
  mode: 'production',
  devtool: false,
  target: 'web',
  entry: path.resolve(__dirname, '..', 'src', 'miniapp', 'index.js'),
  output: {
    path: path.resolve(__dirname, '..', 'dist', 'miniapp'),
    filename: 'tesseract-miniapp.js',
    libraryTarget: 'commonjs2',
    globalObject: "typeof self !== 'undefined' ? self : this",
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
};
