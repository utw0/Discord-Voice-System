/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "discord.js",
    "@discordjs/voice",
    "discord.js-selfbot-v13",
    "@dank074/discord-video-stream",
    "node-av",
    "@lng2004/node-datachannel",
    "zeromq",
    "sharp",
    "fluent-ffmpeg"
  ]
};

export default nextConfig;
