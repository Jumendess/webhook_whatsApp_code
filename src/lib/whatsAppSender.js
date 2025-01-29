const Config = require('../../config/Config');
const Emitter = require('events').EventEmitter;
const log4js = require('log4js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-to-extensions');
let logger = log4js.getLogger('WhatsAppSender');
logger.level = Config.LOG_LEVEL;

/**
* Queue, Dequeue and Send messages to Whatsapp
*/
class WhatsAppSender {

    constructor() {

        this.messagesQueue = [];
        this.eventsEmitter = new Emitter();
        this.whatsAppApiUrl = Config.API_URL;
        this.whatsAppEndpointApi = Config.ENDPOINT_API;
        this.whatsAppVerifyToken = Config.VERIFY_TOKEN;
        this.whatsAppAccessToken = Config.ACCESS_TOKEN;
        this.whatsAppApiVersion = Config.API_VERSION;
        this.whatsAppPhoneNumberId = Config.PHONE_NUMBER_ID;

        this._setupEvents();

        logger.info('WhatsApp Sender initialized');
    }

    /**
     * Setup Queue events.
     * @returns null
     */
    _setupEvents() {
        let self = this;
        // Queue message to deliver to WhatsApp
        self.eventsEmitter.on(Config.EVENT_QUEUE_MESSAGE_TO_WHATSAPP,
            async function (payload) {
                self.messagesQueue.unshift(payload);
                if (self.messagesQueue.length == 1) {
                    try {
                        await self._sendMessageToWhatsApp(payload);
                    } catch (error) {
                        throw error;
                    }
                }
            });

        // WhatsApp Message delivered.
        self.eventsEmitter.on(Config.EVENT_WHATSAPP_MESSAGE_DELIVERED,
            function (messageId) {
                logger.info('message with ID (' + messageId + ') delivered.....');
                self.messagesQueue.pop();
                self.eventsEmitter.emit(Config.EVENT_PROCESS_NEXT_WHATSAPP_MESSAGE);
            });
        // Process next WhatsApp message from queue
        self.eventsEmitter.on(Config.EVENT_PROCESS_NEXT_WHATSAPP_MESSAGE,
            function () {
                if (self.messagesQueue.length > 0) {
                    let nextMessage = self.messagesQueue[self.messagesQueue.length - 1];
                    self._sendMessageToWhatsApp(nextMessage, self);
                }
            });
    }

    /**
    * Send Message to WhatsApp.
    * @returns null
    * @param {object} message - WhatsApp Message Payload to send.
    */
    async _sendMessageToWhatsApp(message) {
        let self = this;
        try {
            const config = {
                method: 'post',
                url: `${self.whatsAppApiUrl}/${self.whatsAppApiVersion}/${self.whatsAppPhoneNumberId}/${self.whatsAppEndpointApi}`,
                headers: {
                  Authorization: `Bearer ${self.whatsAppAccessToken}`,
                  'Content-Type': 'application/json'
                },
                data: message
            };
            await axios(config).then( response => {
                self.eventsEmitter.emit(Config.EVENT_WHATSAPP_MESSAGE_DELIVERED, response.data.messages[0].id);
            }).catch(function (error) {
                throw new Error(error);
            });
        } catch (error) {
            throw error;
        }
    }

    /**
    * Queue Message to be sent to WhatsApp.
    * @returns null
    * @param {object} message - WhatsApp Message payload.
    */
    _queueMessage(message) {
        let self = this;
        self.eventsEmitter.emit(Config.EVENT_QUEUE_MESSAGE_TO_WHATSAPP, message)
    }

    /**
    * Remove message from cache after being delivered.
    * @returns null
    * @param {string} messageId - WhatsApp messageId that was delivered
    */
    messageDelivered(messageId) {
        let self = this;
        self.eventsEmitter.emit(Config.EVENT_WHATSAPP_MESSAGE_DELIVERED, messageId);
    }

    /**
    * Download and save attachment from WhatsApp
    * @returns {string} fileName - file name
    * @param {string} attachment - WhatsApp attachment information
    */
    async _downloadAndSaveWhatsAppAttachmentMessage(attachment) {
        try {
            let self = this;

            // 1️⃣ Obter a URL do anexo com autenticação
            const config = {
                method: "get",
                url: `${self.whatsAppApiUrl}/${self.whatsAppApiVersion}/${attachment.id}`,
                headers: {
                    Authorization: `Bearer ${self.whatsAppAccessToken}`,
                    'Content-Type': 'application/json',
                },
            };

            const response = await axios.request(config);

            if (!response.data.url) {
                console.error("URL do anexo não encontrada!");
                return null;
            }

            const attachmentUrl = response.data.url;

            // 2️⃣ Baixar o arquivo real do WhatsApp
            const fileResponse = await axios({
                method: "get",
                url: attachmentUrl,
                headers: {
                    Authorization: `Bearer ${self.whatsAppAccessToken}`,
                },
                responseType: "arraybuffer",
            });

            // 3️⃣ Definir caminho e nome do arquivo
            const fileName = `whatsapp_${Date.now()}.jpg`;  // Ajuste para outros formatos se necessário
            const filePath = path.join(__dirname, "../../public/uploads", fileName);

            // 4️⃣ Salvar o arquivo localmente
            fs.writeFileSync(filePath, fileResponse.data);

            console.log(`Arquivo salvo em: ${filePath}`);

            // 5️⃣ Retornar o link público do arquivo
            return `${Config.FILES_URL.replace(/\/$/, '')}/uploads/${fileName}`;
        } catch (error) {
            console.error("Erro ao baixar o anexo:", error);
            return null;
        }
    }


}
module.exports = WhatsAppSender;
