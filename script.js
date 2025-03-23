class BarcodeScanner {
    constructor() {
        this.html5QrCode = null;
        this.initializeElements();
        this.initializeEventListeners();
        this.scanHistory = [];
        this.currentStream = null;
        this.API_URL = 'https://server-camera-food.onrender.com/product/info';
    }

    initializeElements() {
        this.elements = {
            startButton: document.getElementById('startButton'),
            resultDiv: document.getElementById('result'),
            productInfoDiv: document.getElementById('productInfo'),
            loadingDiv: document.querySelector('.loading'),
            historyDiv: document.getElementById('history'),
            historyItemsDiv: document.getElementById('historyItems'),
            barcodeInput: document.getElementById('barcodeInput'),
            searchButton: document.getElementById('searchButton'),
            zoomControl: document.getElementById('zoomControl'),
            zoomSlider: document.getElementById('zoomSlider'),
            zoomValue: document.getElementById('zoomValue'),
            modal: document.getElementById('cameraModal'),
            modalCloseBtn: document.getElementById('modalClose'),
            reader: document.getElementById('reader')
        };
    }

    initializeEventListeners() {
        this.elements.startButton.addEventListener('click', () => this.startScanner());
        this.elements.searchButton.addEventListener('click', () => this.handleManualSearch());
        this.elements.barcodeInput.addEventListener('keypress', (e) => this.handleEnterKey(e));
        this.elements.barcodeInput.addEventListener('input', (e) => this.handleInputValidation(e));
        this.elements.modalCloseBtn.addEventListener('click', () => this.stopScanner());
    }

    async startScanner() {
        try {
            this.elements.modal.classList.add('active');
            document.body.style.overflow = 'hidden';

            this.html5QrCode = new Html5Qrcode("reader");

            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                } 
            });
            this.currentStream = stream;
            this.setupZoomControl(stream);
            
            await this.html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.777778
                },
                (decodedText) => this.onScanSuccess(decodedText),
                (error) => this.onScanFailure(error)
            );

        } catch (err) {
            console.error(err);
            alert('Ошибка доступа к камере: ' + err);
            this.stopScanner();
        }
    }

    setupZoomControl(stream) {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();

        if (capabilities.zoom) {
            this.elements.zoomControl.style.display = 'block';
            this.elements.zoomSlider.min = capabilities.zoom.min;
            this.elements.zoomSlider.max = capabilities.zoom.max;
            this.elements.zoomSlider.step = (capabilities.zoom.max - capabilities.zoom.min) / 100;
            this.elements.zoomSlider.value = capabilities.zoom.min;
            this.elements.zoomValue.textContent = '1x';

            this.elements.zoomSlider.oninput = async () => {
                const zoomValue = parseFloat(this.elements.zoomSlider.value);
                await track.applyConstraints({
                    advanced: [{ zoom: zoomValue }]
                });
                this.elements.zoomValue.textContent = `${zoomValue.toFixed(1)}x`;
            };
        }
    }

    async stopScanner() {
        if (this.html5QrCode) {
            await this.html5QrCode.stop();
            this.html5QrCode = null;
        }
        
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }

        this.elements.modal.classList.remove('active');
        document.body.style.overflow = '';
        this.elements.zoomControl.style.display = 'none';
    }

    async onScanSuccess(decodedText) {
        await this.stopScanner();
        const productInfo = await this.fetchBarcodeInfo(decodedText);
        this.displayProductInfo(productInfo);
    }

    onScanFailure(error) {
        console.warn(`Ошибка сканирования: ${error}`);
    }

    async handleManualSearch() {
        const barcode = this.elements.barcodeInput.value.trim();
        if (barcode) {
            const productInfo = await this.fetchBarcodeInfo(barcode);
            this.displayProductInfo(productInfo);
        } else {
            alert('Пожалуйста, введите штрих-код');
        }
    }

    handleEnterKey(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.elements.searchButton.click();
        }
    }

    handleInputValidation(e) {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    }

    async fetchBarcodeInfo(barcode) {
        try {
            this.elements.loadingDiv.style.display = 'block';
            this.elements.resultDiv.style.display = 'none';

            const response = await fetch(`${this.API_URL}?barcode=${barcode}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) {
                throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            return data.success ? {
                success: true,
                name: data.name,
                barcode: data.barcode
            } : {
                success: false,
                error: data.error || 'Товар не найден в базе данных'
            };

        } catch (error) {
            console.error("Полная информация об ошибке:", error);
            let errorMessage = 'Ошибка загрузки данных. ';
            
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                errorMessage += 'Не удалось подключиться к серверу. Убедитесь, что:\n';
                errorMessage += '1. Сервер запущен\n';
                errorMessage += '2. Есть подключение к интернету\n';
                errorMessage += '3. Нет блокировки запросов в браузере\n';
                errorMessage += '4. Отключите блокировщик рекламы для этой страницы';
            } else {
                errorMessage += `${error.name}: ${error.message}`;
            }
            
            return {
                success: false,
                error: errorMessage
            };
        } finally {
            this.elements.loadingDiv.style.display = 'none';
        }
    }

    displayProductInfo(productData) {
        this.elements.loadingDiv.style.display = 'none';
        this.elements.resultDiv.style.display = 'block';
        
        if (productData.success) {
            this.addToHistory(productData);
            
            this.elements.productInfoDiv.innerHTML = `
                <p><strong>Штрих-код:</strong> ${productData.barcode}</p>
                <p><strong>Название:</strong> ${productData.name}</p>
                <div style="margin-top: 15px; padding: 10px; background-color: var(--surface-color); border-radius: 10px;">
                    <p style="margin: 0;"><small>* Данные предоставлены сервисом Barcode-list.ru</small></p>
                    <p style="margin: 5px 0 0 0;"><small>Последнее обновление: ${new Date().toLocaleString()}</small></p>
                </div>
            `;
        } else {
            this.elements.productInfoDiv.innerHTML = `
                <div class="error-message">
                    <p>${productData.error}</p>
                    <p><small>Если ошибка повторяется, попробуйте:</small></p>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                        <li><small>Обновить страницу</small></li>
                        <li><small>Проверить подключение к интернету</small></li>
                        <li><small>Подождать несколько секунд и повторить попытку</small></li>
                    </ul>
                </div>
            `;
        }
    }

    addToHistory(productData) {
        this.scanHistory.unshift({
            timestamp: new Date(),
            ...productData
        });
        
        this.scanHistory = this.scanHistory.slice(0, 10);
        this.updateHistoryDisplay();
    }

    updateHistoryDisplay() {
        if (this.scanHistory.length > 0) {
            this.elements.historyDiv.style.display = 'block';
            this.elements.historyItemsDiv.innerHTML = this.scanHistory.map(item => `
                <div class="history-item">
                    <p><strong>${item.name}</strong></p>
                    <p><small>Штрих-код: ${item.barcode}</small></p>
                    <p><small>Время: ${item.timestamp.toLocaleTimeString()}</small></p>
                </div>
            `).join('');
        }
    }
}

// Initialize the scanner when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BarcodeScanner();
}); 
