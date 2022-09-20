const { promises } = require('fs')
const { join } = require('path')
const Canvas = require('@napi-rs/canvas');

const canvas = Canvas.createCanvas(950, 650);
const ctx = canvas.getContext('2d');


async function main() {
    const island = await Canvas.loadImage('./starting.png');
    const header = await Canvas.loadImage('./buttonLong_brown.png');
    const foodIcon = await Canvas.loadImage('./food.png');
    const dudeIcon = await Canvas.loadImage('./dude.png');
    const stoneIcon = await Canvas.loadImage('./stone.png');
    const woodIcon = await Canvas.loadImage('./wood.png');

    ctx.drawImage(island, -4, -180, 1000, 1000);
    ctx.drawImage(header, 80, 10, 190, 49);
    ctx.drawImage(header, 280, 10, 190, 49);
    ctx.drawImage(header, 480, 10, 190, 49);
    ctx.drawImage(header, 680, 10, 190, 49);
    ctx.drawImage(dudeIcon, 82, 10, 50, 50);
    ctx.drawImage(foodIcon, 285, 10, 50, 50);
    ctx.drawImage(woodIcon, 475, 2, 70, 70);
    ctx.drawImage(stoneIcon, 685, 10, 50, 50);
    addtext(ctx, "2", 200, 42);
    addtext(ctx, "0", 400, 42);
    addtext(ctx, "0", 600, 42);
    addtext(ctx, "0", 800, 42);

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