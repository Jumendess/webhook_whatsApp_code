const Config = require('../../config/Config');
const Emitter = require('events').EventEmitter;
const log4js = require('log4js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
let logger = log4js.getLogger('WhatsAppSender');
logger.level = Config.LOG_LEVEL;

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

        this.conversationTranscript = [];
        this._setupEvents();
        logger.info('WhatsApp Sender initialized');
    }

    _setupEvents() {
        let self = this;
        self.eventsEmitter.on(Config.EVENT_QUEUE_MESSAGE_TO_WHATSAPP, async function (payload) {
            self.messagesQueue.unshift(payload);
            if (self.messagesQueue.length == 1) {
                try {
                    await self._sendMessageToWhatsApp(payload);
                } catch (error) {
                    throw error;
                }
            }
        });

        self.eventsEmitter.on(Config.EVENT_WHATSAPP_MESSAGE_DELIVERED, function (messageId) {
            logger.info('message with ID (' + messageId + ') delivered.....');
            self.messagesQueue.pop();
            self.eventsEmitter.emit(Config.EVENT_PROCESS_NEXT_WHATSAPP_MESSAGE);
        });

        self.eventsEmitter.on(Config.EVENT_PROCESS_NEXT_WHATSAPP_MESSAGE, function () {
            if (self.messagesQueue.length > 0) {
                let nextMessage = self.messagesQueue[self.messagesQueue.length - 1];
                self._sendMessageToWhatsApp(nextMessage, self);
            }
        });
    }

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
            await axios(config).then(response => {
                self.eventsEmitter.emit(Config.EVENT_WHATSAPP_MESSAGE_DELIVERED, response.data.messages[0].id);

                // Adiciona a mensagem enviada à transcrição
                self.conversationTranscript.push({ sender: 'Bot', message: message.text });
            }).catch(function (error) {
                throw new Error(error);
            });
        } catch (error) {
            throw error;
        }
    }

    _queueMessage(message) {
        let self = this;
        self.eventsEmitter.emit(Config.EVENT_QUEUE_MESSAGE_TO_WHATSAPP, message);
    }

    messageDelivered(messageId) {
        let self = this;
        self.eventsEmitter.emit(Config.EVENT_WHATSAPP_MESSAGE_DELIVERED, messageId);
    }

    async _downloadAndSaveWhatsAppAttachmentMessage(attachment) {
        try {
            let self = this;
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

            const fileResponse = await axios({
                method: "get",
                url: attachmentUrl,
                headers: { Authorization: `Bearer ${self.whatsAppAccessToken}` },
                responseType: "arraybuffer",
            });

            const fileExtension = mime.extension(attachment.mime_type) || 'bin';
            const fileName = `whatsapp_${Date.now()}.${fileExtension}`;
            const filePath = path.join(__dirname, "../../public/uploads", fileName);

            fs.writeFileSync(filePath, fileResponse.data);
            console.log(`Arquivo salvo em: ${filePath}`);

            return `${Config.FILES_URL.replace(/\/$/, '')}/uploads/${fileName}`;
        } catch (error) {
            console.error("Erro ao baixar o anexo:", error);
            return null;
        }
    }

    getTranscription() {
        return this.conversationTranscript;
    }
}

module.exports = WhatsAppSender;
