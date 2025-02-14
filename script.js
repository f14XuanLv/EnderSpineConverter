// 文件处理相关函数
const FileProcessor = {
    // 处理 Spine JSON 拆分
    async splitSpineJson(file) {
        try {
            const content = await readFileAsJson(file);
            if (!Array.isArray(content)) {
                throw new Error('无效的 JSON 格式');
            }

            const results = [];
            const baseName = file.name.replace('.json', '');

            for (const item of content) {
                if (item.Type === "SpineAtlasAsset") {
                    const atlasJson = new File(
                        [JSON.stringify([item], null, 2)],
                        `${baseName}-atlas.json`,
                        { type: 'application/json' }
                    );
                    results.push(atlasJson);
                } else if (item.Type === "SpineSkeletonDataAsset") {
                    const dataJson = new File(
                        [JSON.stringify([item], null, 2)],
                        `${baseName}-data.json`,
                        { type: 'application/json' }
                    );
                    results.push(dataJson);
                }
            }

            return results;
        } catch (error) {
            console.error('Split Spine JSON error:', error);
            throw error;
        }
    },

    // 处理 Atlas 转换
    async convertAtlasJson(file) {
        try {
            const content = await readFileAsJson(file);
            if (!Array.isArray(content) || !content[0]?.Properties?.rawData) {
                throw new Error('无效的 Atlas JSON 格式');
            }

            const rawData = content[0].Properties.rawData;
            const processedData = processAtlasData(rawData);
            const outputName = file.name.replace('-atlas.json', '.atlas');

            return new File([processedData], outputName, { type: 'text/plain' });
        } catch (error) {
            console.error('Convert Atlas JSON error:', error);
            throw error;
        }
    },

    // 处理 Data 转换
    async convertDataJson(file) {
        try {
            const content = await readFileAsJson(file);
            if (!Array.isArray(content) || !content[0]?.Properties?.rawData) {
                throw new Error('无效的 Data JSON 格式');
            }

            const rawData = content[0].Properties.rawData;
            if (!Array.isArray(rawData)) {
                throw new Error('无效的 rawData 格式');
            }

            const binaryData = new Uint8Array(rawData);
            const outputName = file.name.replace('-data.json', '.skel');

            return new File([binaryData], outputName, { type: 'application/octet-stream' });
        } catch (error) {
            console.error('Convert Data JSON error:', error);
            throw error;
        }
    }
};

// Atlas 数据处理函数
function processAtlasData(rawData) {
    if (typeof rawData !== 'string') {
        throw new Error('无效的 Atlas 数据格式');
    }

    const lines = rawData.trim().split('\n');
    const processedLines = [];
    let basicInfoProcessed = false;

    for (const line of lines) {
        if (!line.trim()) continue;

        if (line.includes('.png')) {
            if (!processedLines.length || !processedLines.some(l => l.includes('.png'))) {
                processedLines.push(line.trim());
            }
            continue;
        }

        if (!basicInfoProcessed && /size:|format:|filter:|repeat:/.test(line)) {
            if (line.includes('size:')) processedLines.push(line.trim());
            if (line.includes('format:')) processedLines.push('format: RGBA8888');
            if (line.includes('filter:')) {
                processedLines.push(normalizeFilterValue(line.trim()));
                basicInfoProcessed = true;
            }
            if (line.includes('repeat:')) processedLines.push('repeat: none');
            continue;
        }

        if (line.includes('rotate:')) {
            processedLines.push('  rotate: false');
        } else if (/xy:|size:|orig:|offset:|index:/.test(line)) {
            processedLines.push('  ' + line.trim());
        } else {
            processedLines.push(line.trim());
        }
    }

    return '\n' + processedLines.join('\n') + '\n';
}

// 标准化 filter 值
function normalizeFilterValue(line) {
    if (!line.startsWith('filter:')) return line;

    const parts = line.split(':');
    if (parts.length !== 2) return line;

    const filterValues = parts[1].trim().split(',');
    const normalizedValues = filterValues.map(v => 
        v.trim().split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join('')
    );

    return `filter: ${normalizedValues.join(', ')}`;
}

// 工具函数
async function readFileAsJson(file) {
    const text = await file.text();
    return JSON.parse(text);
}

function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 创建输出文件列表项
function createOutputListItem(file, listId) {
    const li = document.createElement('li');
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.name;
    
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '下载';
    downloadBtn.className = 'download-btn';
    downloadBtn.onclick = () => downloadFile(file);
    
    li.appendChild(nameSpan);
    li.appendChild(downloadBtn);
    
    document.getElementById(listId).appendChild(li);
}

// 初始化拖放区域
function initDropZone(dropZoneId, fileInputId, outputListId, processFunction) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);
    const outputList = document.getElementById(outputListId);

    // 处理拖拽进入
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    // 处理拖拽离开
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    // 处理拖拽悬停
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    // 处理文件放下
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files).filter(file => file.name.endsWith('.json'));
        await handleFiles(files, outputListId, processFunction);
    });

    // 处理点击上传
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    // 处理文件选择
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files).filter(file => file.name.endsWith('.json'));
        await handleFiles(files, outputListId, processFunction);
        fileInput.value = ''; // 清除文件选择，允许重复选择同一文件
    });
}

// 处理文件函数
async function handleFiles(files, outputListId, processFunction) {
    for (const file of files) {
        try {
            const results = await processFunction(file);
            if (Array.isArray(results)) {
                results.forEach(result => createOutputListItem(result, outputListId));
            } else if (results) {
                createOutputListItem(results, outputListId);
            }
        } catch (error) {
            console.error(`处理文件 ${file.name} 时出错:`, error);
            alert(`处理文件 ${file.name} 时出错: ${error.message}`);
        }
    }
}

// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
    // 初始化 Spine 拆分器
    initDropZone(
        'splitDropZone',
        'splitFileInput',
        'splitOutputList',
        FileProcessor.splitSpineJson
    );

    // 初始化 Atlas 转换器
    initDropZone(
        'atlasDropZone',
        'atlasFileInput',
        'atlasOutputList',
        FileProcessor.convertAtlasJson
    );

    // 初始化 Data 转换器
    initDropZone(
        'dataDropZone',
        'dataFileInput',
        'dataOutputList',
        FileProcessor.convertDataJson
    );
});
    