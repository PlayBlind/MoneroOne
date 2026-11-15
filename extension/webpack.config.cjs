const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/app.js',
  output: { path: path.resolve(__dirname, 'dist'), filename: 'app.js', clean: true },
  devtool: false,
  resolve: {
    fallback: {
      fs: false, net: false, tls: false, child_process: false, worker_threads: false,
      'socks-proxy-agent': false,
      assert: require.resolve('assert/'),
      path: require.resolve('path-browserify'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      os: require.resolve('os-browserify/browser'),
      url: require.resolve('url/'),
      util: require.resolve('util/'),
      buffer: require.resolve('buffer/'),
      vm: false
    }
  },
  plugins: [
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'], process: 'process/browser' }),
    new CopyPlugin({ patterns: [
      { from: 'public', to: '.' },
      { from: '../LICENSE', to: 'LICENSE' },
      { from: 'node_modules/monero-ts/dist/monero.worker.js', to: 'monero.worker.js' },
      { from: 'node_modules/monero-ts/dist/monero.worker.js.LICENSE.txt', to: '.' },
      { from: 'node_modules/monero-ts/LICENSE.txt', to: 'MONERO-TS-LICENSE.txt' }
    ] })
  ],
  devServer: {
    allowedHosts: 'all',
    hot: false,
    liveReload: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  performance: { hints: false }
};
