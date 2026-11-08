const fileInput = document.querySelector("#fileInput");
const chooseFileButton = document.querySelector("#chooseFile");
const dropzone = document.querySelector("#dropzone");
const uploadPrompt = document.querySelector("#uploadPrompt");
const canvas = document.querySelector("#imageCanvas");
const processedPreview = document.querySelector("#processedPreview");
const removeImageButton = document.querySelector("#removeImage");
const statusMessage = document.querySelector("#statusMessage");
const fileSizeText = document.querySelector("#fileSizeText");
const downloadButton = document.querySelector("#downloadImage");
const context = canvas.getContext("2d");
const processingCanvas = document.createElement("canvas");
const processingContext = processingCanvas.getContext("2d");
const outputCanvas = document.createElement("canvas");
const outputContext = outputCanvas.getContext("2d");
const liveBaseCanvas = document.createElement("canvas");
const liveBaseContext = liveBaseCanvas.getContext("2d");
const liveBlockCanvas = document.createElement("canvas");
const liveBlockContext = liveBlockCanvas.getContext("2d");
const livePreviewCanvas = document.createElement("canvas");
const livePreviewContext = livePreviewCanvas.getContext("2d");

const controls = {
    quality: document.querySelector("#qualitySlider"),
    saturation: document.querySelector("#saturationRange"),
    hue: document.querySelector("#hueRange"),
    text: document.querySelector("#textValue"),
    textPosition: document.querySelector("#textPosition"),
    textColor: document.querySelector("#textColor"),
    textSize: document.querySelector("#textSize"),
    caption: document.querySelector("#captionValue"),
    captionSize: document.querySelector("#captionSize"),
};

const outputs = {
    quality: document.querySelector("#qualityValue"),
    saturation: document.querySelector("#saturationValue"),
    hue: document.querySelector("#hueValue"),
    textSize: document.querySelector("#textSizeValue"),
    captionSize: document.querySelector("#captionSizeValue"),
};

const transform = {
    rotation: 0,
    flipHorizontal: 1,
    flipVertical: 1,
};

let sourceImage = null;
let currentFile = null;
let appliedText = false;
let loadSequence = 0;
let processSequence = 0;
let processedBlob = null;
let previewUrl = null;
let processTimer = 0;
let renderTimer = 0;
let livePreviewFrame = 0;

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) {
        return "0 Bytes";
    }

    const sizes = ["Bytes", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    const precision = Math.max(0, decimals);
    return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(precision))} ${sizes[index]}`;
}

function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("is-error", isError);
}

function updateOutputs() {
    outputs.quality.value = `${controls.quality.value}%`;
    outputs.saturation.value = `${controls.saturation.value}%`;
    outputs.hue.value = `${controls.hue.value}°`;
    outputs.textSize.value = `${controls.textSize.value} px`;
    outputs.captionSize.value = `${controls.captionSize.value} px`;
}

function getBurikSettings() {
    const burikAmount = Number(controls.quality.value) / 100;
    return {
        scaleFactor: 1 - Math.min(burikAmount * 2, 1) * 0.5,
        quality: burikAmount <= 0.5
            ? 0.92 - (0.92 - 0.05) * burikAmount * 2
            : 0.05 - (0.05 - 0.001) * (burikAmount - 0.5) * 2,
    };
}

function getImageDimensions() {
    const isSideways = Math.abs(transform.rotation % 180) === 90;
    return {
        width: isSideways ? sourceImage.naturalHeight : sourceImage.naturalWidth,
        height: isSideways ? sourceImage.naturalWidth : sourceImage.naturalHeight,
    };
}

function getTextScale(scale) {
    return scale * getImageDimensions().width / 800;
}

function wrapTextLines(targetContext, text, maxWidth) {
    const lines = [];
    let line = "";

    for (const word of text.split(/\s+/)) {
        let remaining = word;
        while (remaining) {
            const candidate = line ? `${line} ${remaining}` : remaining;
            if (targetContext.measureText(candidate).width <= maxWidth) {
                line = candidate;
                break;
            }
            if (line) {
                lines.push(line);
                line = "";
                continue;
            }

            let chunk = "";
            for (const character of remaining) {
                if (chunk && targetContext.measureText(`${chunk}${character}`).width > maxWidth) {
                    lines.push(chunk);
                    chunk = "";
                }
                chunk += character;
            }
            line = chunk;
            break;
        }
    }

    if (line) {
        lines.push(line);
    }
    return lines;
}

function getCaptionLayout(targetContext, width, scale) {
    const text = controls.caption.value.trim();
    if (!text) {
        return { lines: [], fontSize: 0, lineHeight: 0, height: 0 };
    }

    const fontSize = Number(controls.captionSize.value) * getTextScale(scale);
    const paddingX = fontSize * 0.45;
    const paddingY = fontSize * 0.4;
    const lineHeight = fontSize * 1.2;
    targetContext.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
    const lines = wrapTextLines(targetContext, text, width - paddingX * 2);

    return {
        lines,
        fontSize,
        lineHeight,
        paddingX,
        paddingY,
        height: Math.ceil(lines.length * lineHeight + paddingY * 2),
    };
}

function drawComposition(targetContext, width, imageHeight, scale) {
    const caption = getCaptionLayout(targetContext, width, scale);
    const totalHeight = imageHeight + caption.height;
    targetContext.clearRect(0, 0, width, totalHeight);

    if (caption.height) {
        targetContext.fillStyle = "#ffffff";
        targetContext.fillRect(0, 0, width, caption.height);
        targetContext.save();
        targetContext.font = `900 ${caption.fontSize}px Arial, Helvetica, sans-serif`;
        targetContext.fillStyle = "#111111";
        targetContext.textAlign = "center";
        targetContext.textBaseline = "middle";
        caption.lines.forEach((line, index) => {
            targetContext.fillText(
                line,
                width / 2,
                caption.paddingY + caption.lineHeight * (index + 0.5),
                width - caption.paddingX * 2
            );
        });
        targetContext.restore();
    }

    targetContext.save();
    targetContext.translate(width / 2, caption.height + imageHeight / 2);
    targetContext.rotate((transform.rotation * Math.PI) / 180);
    targetContext.scale(transform.flipHorizontal, transform.flipVertical);
    targetContext.filter = `saturate(${controls.saturation.value}%) hue-rotate(${controls.hue.value}deg)`;
    targetContext.drawImage(
        sourceImage,
        -sourceImage.naturalWidth * scale / 2,
        -sourceImage.naturalHeight * scale / 2,
        sourceImage.naturalWidth * scale,
        sourceImage.naturalHeight * scale
    );
    targetContext.restore();

    if (appliedText && controls.text.value.trim()) {
        let fontSize = Number(controls.textSize.value) * getTextScale(scale);
        const label = controls.text.value.trim();
        const maxTextWidth = width * 0.9;
        targetContext.save();
        targetContext.textAlign = "center";
        targetContext.textBaseline = "middle";
        targetContext.lineJoin = "round";
        targetContext.strokeStyle = "rgba(0, 0, 0, 0.7)";
        targetContext.fillStyle = controls.textColor.value;
        let lines;
        let margin;
        let lineHeight;
        let lineWidth;
        for (;;) {
            targetContext.font = `bold ${fontSize}px Arial, sans-serif`;
            lines = wrapTextLines(targetContext, label, maxTextWidth);
            lineWidth = Math.max(2, fontSize / 12);
            margin = fontSize * 0.75 + lineWidth / 2;
            lineHeight = fontSize * 1.2;
            const textHeight = lines.length * lineHeight;
            if (textHeight + margin * 2 <= imageHeight) {
                break;
            }
            fontSize *= imageHeight / (textHeight + margin * 2) * 0.98;
        }
        targetContext.lineWidth = lineWidth;
        const textHeight = lines.length * lineHeight;
        const firstLineY = controls.textPosition.value === "top"
            ? caption.height + margin + lineHeight / 2
            : controls.textPosition.value === "bottom"
                ? caption.height + imageHeight - margin - textHeight + lineHeight / 2
                : caption.height + (imageHeight - textHeight) / 2 + lineHeight / 2;
        lines.forEach((line, index) => {
            const textY = firstLineY + index * lineHeight;
            targetContext.strokeText(line, width / 2, textY, maxTextWidth);
            targetContext.fillText(line, width / 2, textY, maxTextWidth);
        });
        targetContext.restore();
    }

    return totalHeight;
}

function renderLivePreview() {
    if (!sourceImage) {
        return;
    }

    const { width, height } = getImageDimensions();
    const captionEstimate = controls.caption.value.trim()
        ? Number(controls.captionSize.value) * getTextScale(1) * 4
        : 0;
    const previewScale = Math.min(1, 800 / width, 700 / (height + captionEstimate));
    const previewWidth = Math.max(1, Math.round(width * previewScale));
    const previewHeight = Math.max(1, Math.round(height * previewScale));
    const { scaleFactor, quality } = getBurikSettings();
    const caption = getCaptionLayout(liveBaseContext, previewWidth, previewScale);
    const totalHeight = previewHeight + caption.height;
    const scaledWidth = Math.max(1, Math.round(previewWidth * scaleFactor));
    const scaledHeight = Math.max(1, Math.round(totalHeight * scaleFactor));

    if (liveBaseCanvas.width !== previewWidth || liveBaseCanvas.height !== totalHeight) {
        liveBaseCanvas.width = previewWidth;
        liveBaseCanvas.height = totalHeight;
    }
    if (liveBlockCanvas.width !== scaledWidth || liveBlockCanvas.height !== scaledHeight) {
        liveBlockCanvas.width = scaledWidth;
        liveBlockCanvas.height = scaledHeight;
    }
    if (livePreviewCanvas.width !== previewWidth || livePreviewCanvas.height !== totalHeight) {
        livePreviewCanvas.width = previewWidth;
        livePreviewCanvas.height = totalHeight;
    }

    try {
        drawComposition(liveBaseContext, previewWidth, previewHeight, previewScale);
        liveBlockContext.clearRect(0, 0, scaledWidth, scaledHeight);
        liveBlockContext.drawImage(liveBaseCanvas, 0, 0, scaledWidth, scaledHeight);
        livePreviewContext.clearRect(0, 0, previewWidth, totalHeight);
        livePreviewContext.imageSmoothingEnabled = false;
        livePreviewContext.drawImage(liveBlockCanvas, 0, 0, previewWidth, totalHeight);
        processedPreview.src = livePreviewCanvas.toDataURL("image/jpeg", quality);
        processedPreview.hidden = false;
    } catch (error) {
        showStatus(`Gagal memperbarui pratinjau: ${error.message}`, true);
    }
}

function scheduleLivePreview() {
    if (livePreviewFrame) {
        return;
    }

    livePreviewFrame = window.requestAnimationFrame(() => {
        livePreviewFrame = 0;
        renderLivePreview();
    });
}

function processImage() {
    if (!currentFile || !canvas.width || !canvas.height) {
        return;
    }

    const sequence = ++processSequence;
    const { scaleFactor, quality } = getBurikSettings();
    downloadButton.disabled = true;
    processingCanvas.width = Math.max(1, Math.round(canvas.width * scaleFactor));
    processingCanvas.height = Math.max(1, Math.round(canvas.height * scaleFactor));
    outputCanvas.width = canvas.width;
    outputCanvas.height = canvas.height;

    try {
        processingContext.clearRect(0, 0, processingCanvas.width, processingCanvas.height);
        processingContext.drawImage(canvas, 0, 0, processingCanvas.width, processingCanvas.height);
        processingCanvas.toBlob((blob) => {
            if (sequence !== processSequence) {
                return;
            }
            if (!blob) {
                showStatus("Gambar gagal diproses menjadi JPG.", true);
                return;
            }

            const compressedUrl = URL.createObjectURL(blob);
            const compressedImage = new Image();
            compressedImage.onload = () => {
                URL.revokeObjectURL(compressedUrl);
                if (sequence !== processSequence) {
                    return;
                }

                outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
                outputContext.imageSmoothingEnabled = false;
                outputContext.drawImage(compressedImage, 0, 0, outputCanvas.width, outputCanvas.height);
                outputCanvas.toBlob((outputBlob) => {
                    if (sequence !== processSequence) {
                        return;
                    }
                    if (!outputBlob) {
                        showStatus("Gambar gagal diproses menjadi JPG.", true);
                        return;
                    }

                    processedBlob = outputBlob;
                    if (previewUrl) {
                        URL.revokeObjectURL(previewUrl);
                    }
                    previewUrl = URL.createObjectURL(outputBlob);
                    processedPreview.src = previewUrl;
                    processedPreview.hidden = false;
                    fileSizeText.textContent = `Ukuran asli: ${formatBytes(currentFile.size)} | Hasil: ${formatBytes(outputBlob.size)}`;
                    downloadButton.disabled = false;
                }, "image/jpeg", 0.92);
            };
            compressedImage.onerror = () => {
                URL.revokeObjectURL(compressedUrl);
                if (sequence === processSequence) {
                    showStatus("Gambar gagal diproses menjadi JPG.", true);
                }
            };
            compressedImage.src = compressedUrl;
        }, "image/jpeg", quality);
    } catch (error) {
        if (sequence === processSequence) {
            showStatus(`Gagal memproses gambar: ${error.message}`, true);
        }
    }
}

function scheduleImageProcessing() {
    window.clearTimeout(processTimer);
    ++processSequence;
    if (currentFile) {
        downloadButton.disabled = true;
    }
    processTimer = window.setTimeout(processImage, 180);
}

function scheduleImageRender() {
    window.clearTimeout(renderTimer);
    window.clearTimeout(processTimer);
    ++processSequence;
    if (currentFile) {
        downloadButton.disabled = true;
    }
    renderTimer = window.setTimeout(renderImage, 180);
}

function renderImage() {
    if (!sourceImage || !context) {
        return;
    }

    const { width, height } = getImageDimensions();
    const caption = getCaptionLayout(context, width, 1);
    if (canvas.width !== width || canvas.height !== height + caption.height) {
        canvas.width = width;
        canvas.height = height + caption.height;
    }

    try {
        drawComposition(context, width, height, 1);
        renderLivePreview();
        scheduleImageProcessing();
        showStatus("Perubahan diterapkan.");
    } catch (error) {
        showStatus(`Gagal memproses gambar: ${error.message}`, true);
    }
}

function loadImage(file) {
    if (!file || !file.type.startsWith("image/")) {
        showStatus("Pilih file gambar dengan format yang didukung.", true);
        return;
    }

    const currentSequence = ++loadSequence;
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        if (currentSequence !== loadSequence) {
            return;
        }

        sourceImage = image;
        currentFile = file;
        controls.quality.value = "0";
        updateOutputs();
        processedPreview.hidden = true;
        uploadPrompt.hidden = true;
        removeImageButton.hidden = false;
        dropzone.classList.add("has-image");
        downloadButton.disabled = true;
        downloadButton.hidden = false;
        processedBlob = null;
        fileSizeText.textContent = "Memproses gambar...";
        renderImage();
        showStatus(`Gambar dimuat: ${file.name}`);
    };

    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (currentSequence === loadSequence) {
            showStatus("Gambar tidak dapat dibuka. Coba pilih file gambar lain.", true);
        }
    };

    image.src = objectUrl;
}

function removeImage() {
    ++loadSequence;
    ++processSequence;
    window.clearTimeout(processTimer);
    window.clearTimeout(renderTimer);
    if (livePreviewFrame) {
        window.cancelAnimationFrame(livePreviewFrame);
        livePreviewFrame = 0;
    }

    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }

    sourceImage = null;
    currentFile = null;
    processedBlob = null;
    appliedText = false;
    transform.rotation = 0;
    transform.flipHorizontal = 1;
    transform.flipVertical = 1;
    controls.quality.value = "0";
    controls.saturation.value = "100";
    controls.hue.value = "0";
    controls.text.value = "";
    controls.textPosition.value = "center";
    controls.textColor.value = "#ffffff";
    controls.textSize.value = "96";
    controls.caption.value = "";
    controls.captionSize.value = "96";
    fileInput.value = "";
    canvas.width = 0;
    canvas.height = 0;
    processedPreview.removeAttribute("src");
    processedPreview.hidden = true;
    removeImageButton.hidden = true;
    uploadPrompt.hidden = false;
    dropzone.classList.remove("has-image");
    downloadButton.disabled = true;
    downloadButton.hidden = true;
    fileSizeText.textContent = "Ukuran hasil: -";
    updateOutputs();
    showStatus("");
}

chooseFileButton.addEventListener("click", () => fileInput.click());
removeImageButton.addEventListener("click", removeImage);

fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) {
        loadImage(file);
    }
    fileInput.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
    dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add("is-dragging");
    });
}

for (const eventName of ["dragleave", "drop"]) {
    dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove("is-dragging");
    });
}

dropzone.addEventListener("drop", (event) => {
    const [file] = [...event.dataTransfer.files].filter((item) => item.type.startsWith("image/"));
    if (file) {
        loadImage(file);
    } else {
        showStatus("Seret file gambar ke area pratinjau.", true);
    }
});

document.addEventListener("paste", (event) => {
    const imageItem = [...(event.clipboardData?.items ?? [])].find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (file) {
        loadImage(file);
    }
});

controls.quality.addEventListener("input", () => {
    updateOutputs();
    scheduleLivePreview();
    scheduleImageRender();
});

for (const control of [controls.saturation, controls.hue]) {
    control.addEventListener("input", () => {
        updateOutputs();
        scheduleLivePreview();
        scheduleImageRender();
    });
}

document.querySelector("#resetFilters").addEventListener("click", () => {
    controls.quality.value = "0";
    controls.saturation.value = "100";
    controls.hue.value = "0";
    updateOutputs();
    renderImage();
});

document.querySelector("#rotateLeft").addEventListener("click", () => {
    transform.rotation = (transform.rotation + 270) % 360;
    renderImage();
});

document.querySelector("#rotateRight").addEventListener("click", () => {
    transform.rotation = (transform.rotation + 90) % 360;
    renderImage();
});

document.querySelector("#flipHorizontal").addEventListener("click", () => {
    transform.flipHorizontal *= -1;
    renderImage();
});

document.querySelector("#flipVertical").addEventListener("click", () => {
    transform.flipVertical *= -1;
    renderImage();
});

document.querySelector("#resetTransform").addEventListener("click", () => {
    transform.rotation = 0;
    transform.flipHorizontal = 1;
    transform.flipVertical = 1;
    renderImage();
});

document.querySelector("#addText").addEventListener("click", () => {
    if (!controls.text.value.trim()) {
        showStatus("Masukkan teks yang ingin ditambahkan ke gambar.", true);
        controls.text.focus();
        return;
    }
    appliedText = true;
    renderImage();
});

document.querySelector("#clearText").addEventListener("click", () => {
    controls.text.value = "";
    appliedText = false;
    renderImage();
});

for (const control of [controls.text, controls.textColor, controls.textSize, controls.textPosition]) {
    control.addEventListener("input", () => {
        updateOutputs();
        if (appliedText) {
            scheduleLivePreview();
            scheduleImageRender();
        }
    });
}

for (const control of [controls.caption, controls.captionSize]) {
    control.addEventListener("input", () => {
        updateOutputs();
        if (sourceImage) {
            scheduleLivePreview();
            scheduleImageRender();
        }
    });
}

document.querySelectorAll(".nav-tabs [data-tool]").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".nav-tabs [data-tool]").forEach((item) => {
            const isSelected = item === tab;
            item.classList.toggle("is-active", isSelected);
            item.setAttribute("aria-selected", String(isSelected));
        });
        document.querySelectorAll(".tool-panel").forEach((panel) => {
            panel.hidden = panel.id !== tab.getAttribute("aria-controls");
        });
    });
});

downloadButton.addEventListener("click", () => {
    if (!processedBlob || !currentFile) {
        showStatus("Pilih gambar sebelum mengunduh hasil.", true);
        return;
    }

    const downloadUrl = URL.createObjectURL(processedBlob);
    const link = document.createElement("a");
    const fileName = currentFile.name.replace(/\.[^.]+$/, "") || "gambar";
    link.href = downloadUrl;
    link.download = `buriq_${fileName}.jpg`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showStatus("Gambar JPG berhasil diunduh.");
});

updateOutputs();
if (!context) {
    showStatus("Browser ini tidak mendukung canvas untuk mengedit gambar.", true);
}
