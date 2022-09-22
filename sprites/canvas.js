const { promises } = require('fs')
const { join } = require('path')
const Canvas = require('@napi-rs/canvas');

const canvas = Canvas.createCanvas(950, 650);
const ctx = canvas.getContext('2d');


async function main() {
    const island = await Canvas.loadImage('sprites/starting.png');
    const header = await Canvas.loadImage('sprites/buttonLong_brown.png');
    const foodIcon = await Canvas.loadImage('sprites/food.png');
    const goldIcon = await Canvas.loadImage('sprites/gold.png');
    const stoneIcon = await Canvas.loadImage('sprites/stone.png');
    const woodIcon = await Canvas.loadImage('sprites/wood.png');

    ctx.drawImage(island, -4, -180, 1000, 1000);
    ctx.drawImage(header, 50, 10, 190, 49);
    ctx.drawImage(header, 265, 10, 190, 49);
    ctx.drawImage(header, 485, 10, 190, 49);
    ctx.drawImage(header, 700, 10, 190, 49);
    ctx.drawImage(goldIcon, 52, 10, 50, 50);
    ctx.drawImage(foodIcon, 270, 10, 50, 50);
    ctx.drawImage(woodIcon, 480, 2, 70, 70);
    ctx.drawImage(stoneIcon, 705, 10, 50, 50);
    addtext(ctx, "0", 160, 42);
    addtext(ctx, "0", 375, 42);
    addtext(ctx, "0", 595, 42);
    addtext(ctx, "0", 810, 42);

    const pngData = await canvas.encode('png') // JPEG, AVIF and WebP are also supported
    // encoding in libuv thread pool, non-blocking

    await promises.writeFile(join(__dirname, 'simple.png'), pngData)
}

function addtext(ctx, text, x, y) {
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y);
}

main()