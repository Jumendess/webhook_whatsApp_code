const Config = require('../../config/Config');
const Emitter = require('events').EventEmitter;
const log4js = require('log4js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const FormData = require('form-data');
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
            const config = {
                method: "get",
                url: `${self.whatsAppApiUrl}/${self.whatsAppApiVersion}/` + attachment.id,
                headers: {
                    Authorization: `Bearer ${self.whatsAppAccessToken}`,
                    'Content-Type': 'application/json'
                },
                data: ''
            };
            const response = await axios.request(config);
            const attachmentResponse = await axios({
                method: "get",
                url: response.data.url,
                headers: {
                    Authorization: `Bearer ${self.whatsAppAccessToken}`,
                    'Content-Type': 'application/json'
                },
                responseType: "stream"
            });
            const fileName = 'file_'.concat(Date.now()).concat('.').concat(mime.extension(attachment.mime_type));
            await attachmentResponse.data.pipe(fs.createWriteStream(path.join(__dirname, '../../downloads/').concat(fileName)));
            return fileName;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

}
module.exports = WhatsAppSender;
