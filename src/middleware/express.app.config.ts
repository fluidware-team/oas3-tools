'use strict';

import * as express from 'express';
import cookieParser = require('cookie-parser');
import bodyParser = require('body-parser');
import cors = require('cors');
import { SwaggerUI } from './swagger.ui';
import { SwaggerRouter } from './swagger.router';
import { SwaggerParameters } from './swagger.parameters';
import * as logger from 'morgan';
import * as fs from 'fs';
import * as jsyaml from 'js-yaml';
import * as OpenApiValidator from 'express-openapi-validator';
import { Oas3AppOptions } from './oas3.options';
import { OpenApiRequestHandler } from 'express-openapi-validator/dist/framework/types'

export class ExpressAppConfig {
    private app: express.Application;
    private routingOptions;
    private definitionPath;
    private openApiValidatorOptions;

    constructor(definitionPath: string, appOptions: Oas3AppOptions, customMiddlewares?: OpenApiRequestHandler[]) {
        this.definitionPath = definitionPath;
        this.routingOptions = appOptions.routing;
        this.setOpenApiValidatorOptions(definitionPath, appOptions);

        // Create new express app only if not passed by options
        this.app = appOptions.app || express();

        this.app.use(cors(appOptions.cors));

        const spec = fs.readFileSync(definitionPath, 'utf8');
        const swaggerDoc = jsyaml.load(spec);

        this.app.use(bodyParser.urlencoded());
        this.app.use(bodyParser.text());
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.raw({ type: 'application/pdf' }));

        this.app.use(this.configureLogger(appOptions.logging));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: false }));
        this.app.use(cookieParser());

        const swaggerUi = new SwaggerUI(swaggerDoc, appOptions.swaggerUI);
        this.app.use(swaggerUi.serveStaticContent());

        this.app.use(OpenApiValidator.middleware(this.openApiValidatorOptions));
        this.app.use(new SwaggerParameters().checkParameters());
        // Bind custom middlewares which need access to the OpenApiRequest context before controllers initialization
        (customMiddlewares || []).forEach(middleware => this.app.use(middleware))
        this.app.use(new SwaggerRouter().initialize(this.routingOptions));

        this.app.use(this.errorHandler);
    }

    private setOpenApiValidatorOptions(definitionPath: string, appOptions: Oas3AppOptions) {
        //If no options or no openApiValidator Options given, create empty options with api definition path
        if (!appOptions || !appOptions.openApiValidator) {
            this.openApiValidatorOptions = { apiSpec: definitionPath };
            return;
        }

        // use the given options
        this.openApiValidatorOptions = appOptions.openApiValidator;

        // Override apiSpec with definition Path to keep the prior behavior
        this.openApiValidatorOptions.apiSpec = definitionPath;
    }

    public configureLogger(loggerOptions) {
        let format = 'dev';
        let options: {} = {};

        if (loggerOptions != undefined) {
            if (loggerOptions.format != undefined
                && typeof loggerOptions.format === 'string') {
                format = loggerOptions.format;
            }

            if (loggerOptions.errorLimit != undefined
                && (typeof loggerOptions.errorLimit === 'string' || typeof loggerOptions.errorLimit === 'number')) {
                options['skip'] = function (req, res) { return res.statusCode < parseInt(loggerOptions.errorLimit); };
            }
        }

        return logger(format, options);
    }

    private errorHandler(error, request, response, next) {
        response.status(error.status || 500).json({
            message: error.message,
            errors: error.errors,
        });
    }

    public getApp(): express.Application {
        return this.app;
    }
}
