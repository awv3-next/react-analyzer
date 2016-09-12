import React from 'react';
import { Provider } from 'react-redux';
import { createStore, combineReducers } from 'redux';
import { routerReducer as routing } from 'react-router-redux';

import { apply as jsonPatch } from 'fast-json-patch';
import cloneDeep from 'lodash/cloneDeep';
import SocketIO from 'awv3/communication/socketio';
import alertify from 'alertify.js';

const SET_URL = 'SET_URL';
const ADD_LOG = 'ADD_LOG';
const SET_CONNECTED = 'SET_CONNECTED';
const NOTIFY = 'NOTIFY';
const PATCH = 'PATCH';

const settings = (state = {}, action) => {
    switch (action.type) {
        case SET_URL:
            return { ...state, url: action.url };
        default:
            return state;
    }
};

const log = (state = [], action) => {
    switch (action.type) {
        case ADD_LOG:
            //return [ ...state.slice(-200), action.object ];
            return [ ...state, action.object ];
        default:
            return state;
    }
};

const internal = (state = {}, action) => {
    switch (action.type) {
        case PATCH:
            if (action.delta.patch) {
                state = cloneDeep(state);
                jsonPatch(state, action.delta.patch);
            } else {
                state = action.delta;
            }
            return state;

        default:
            return state;
    }
}

const status = (state = {}, action) => {
    switch (action.type) {
        case SET_CONNECTED:
            return { ...state, connected: action.connected };
        case NOTIFY:
            return { ...state, message: action.message };
        default:
            return state;
    }
};

const localState = {
    status: {
        connected: false,
        message: "..."
    },
    settings: {
        url: document.location.hostname == 'localhost' ? 'http://localhost:8181' : `${window.location.protocol}//${document.location.hostname}`,
        templates: {
            javascript: require("raw!./assets/template_js.txt"),
            classcad: require("raw!./assets/template_cc.txt"),
        },
        layout: require("json!./assets/layout.json")
    }
};

// Get state local storage, if any
try {
    let state = localStorage.getItem('SETTINGS');
    if (state !== null) {
        localState.settings = JSON.parse(state);
    }
} catch(e) { /* ... */ }

// Expose store and actions
export const store = createStore(combineReducers({ settings, log, status, internal, routing }), localState);

export const setUrl = url => ({ type: SET_URL, url });
export const addLog = object => ({ type: ADD_LOG, object });
export const notify = message => ({ type: NOTIFY, message });
export const setConnected = connected => ({ type: SET_CONNECTED, connected });
export const patch = delta => ({ type: PATCH, delta });

class Analyzer extends SocketIO {
    constructor() {
        super({ debug: true, credentials: [] });
        this.on('connected', (socket, data) => {
            store.dispatch(patch(data.tree));
            store.dispatch(setConnected(true));
            this.socket.on('debug', data => {
                SocketIO._ack(this.socket);

                requestIdleCallback(() => {
                    switch(data.type) {
                        case 'message':
                            return store.dispatch(addLog(data));
                        case 'patch':
                            return store.dispatch(patch(data));
                    }
                });
                
            });
        });
        this.on('disconnected', socket => {
            store.dispatch(setConnected(false));
        });
    }
}

let url = store.getState().settings.url;
let analyzer = new Analyzer();
analyzer.connect(url)
    .then( _ => store.dispatch(notify(`Connected to ${url}`)))
    .catch( reason => {
        store.dispatch(notify(`Could not connect to ${url}, reason: ${reason}`));
        alertify.defaultValue(url).prompt("Enter server endpoint", val => {
            store.dispatch(setUrl(val));
            url = store.getState().settings.url;
            analyzer.connect(url)
                .then( _ => store.dispatch(notify(`Connected to ${url}`)))
                .catch( reason => store.dispatch(notify(`Could not connect to ${url}, reason: ${reason}`)));
        });
    });