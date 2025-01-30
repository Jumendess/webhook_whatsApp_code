require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const log4js = require('log4js');
let logger = log4js.getLogger('Server');
const WhatsApp = require('./lib/whatsApp');
const Config = require('../config/Config');
logger.level = Config.LOG_LEVEL;

const app = express();
app.use(bodyParser.json());

const OracleBot = require('@oracle/bots-node-sdk');
const { WebhookClient, WebhookEvent } = OracleBot.Middleware;
const { MessageModel } = require('@oracle/bots-node-sdk/lib');

const webhook = new WebhookClient({
    channel: {
        url: Config.ODA_WEBHOOK_URL,
        secret: Config.ODA_WEBHOOK_SECRET
    }
});

OracleBot.init(app, {
    logger: logger,
});

// Init WhatsApp Connector
const whatsApp = new WhatsApp();

// Armazena a transcrição das mensagens
let conversationTranscript = [];

// Middleware para permitir CORS
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// Servir arquivos estáticos (uploads)
const staticPath = path.resolve('public', 'uploads');
app.use('/uploads', express.static(staticPath));

app.get('/', (req, res) => res.send('Oracle Digital Assistant Webhook rodando.'));

// Endpoint para verificar o webhook
app.get('/user/message', (req, res) => {
    try {
        logger.info('Verificando o webhook do WhatsApp.');
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode === "subscribe" && token === Config.VERIFY_TOKEN) {
            console.log("Webhook verificado");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } catch (error) {
        logger.error(error);
        res.sendStatus(500);
    }
});

// Manipular mensagens recebidas do WhatsApp
app.post('/user/message', async (req, res) => {
    try {
        logger.info('Recebendo mensagem do WhatsApp e processando para envio ao ODA.');
        let response = await whatsApp._receive(req.body.entry);

        if (response) {
            if (response.length > 0) {
                response.forEach(async message => {
                    await webhook.send(message);
                    logger.info('Mensagem enviada ao ODA com sucesso.');

                    // Salvar a mensagem recebida na transcrição
                    conversationTranscript.push({
                        sender: 'Usuário',
                        message: message.messagePayload.text
                    });
                });
            } else {
                logger.error('Tipo de mensagem não suportado');
                return res.status(400).send('Tipo de mensagem não suportado');
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.sendStatus(500);
    }
});

// Manipular mensagens enviadas pelo ODA
app.post('/bot/message', async (req, res) => {
    try {
        logger.info('Recebendo mensagem do ODA e processando para envio ao WhatsApp.');
        await whatsApp._send(req.body);
        logger.info('Mensagem enviada ao WhatsApp com sucesso.');

        // Salvar a mensagem do ODA na transcrição
        conversationTranscript.push({
            sender: 'Bot',
            message: req.body.messagePayload.text
        });

        res.sendStatus(200);
    } catch (error) {
        console.log(error);
        return res.status(500).send(error);
    }
});

// Endpoint para recuperar a transcrição da conversa
app.get('/getTranscription', (req, res) => {
    res.json({ conversation: conversationTranscript });
});

// Iniciar o servidor
app.listen(Config.port, () => {
    logger.info(`Servidor rodando em http://localhost:${Config.port}`);
});
