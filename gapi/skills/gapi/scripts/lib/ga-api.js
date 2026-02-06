'use strict';

const {google} = require('googleapis');
const {printJson, requireFlags, parseJsonInput} = require('./utils');

function createGaApi(createAuthedClient) {
  function getAnalyticsAdmin() {
    const auth = createAuthedClient();
    return google.analyticsadmin({version: 'v1beta', auth});
  }

  // Accounts
  const accounts = {
    async list() {
      const ga = getAnalyticsAdmin();
      const res = await ga.accounts.list({});
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'accountId');
      const ga = getAnalyticsAdmin();
      const res = await ga.accounts.get({name: `accounts/${flags.accountId}`});
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'accountId');
      const ga = getAnalyticsAdmin();
      await ga.accounts.delete({name: `accounts/${flags.accountId}`});
      printJson({ok: true, action: 'accounts.delete'});
    },

    async patch(flags) {
      requireFlags(flags, 'accountId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.accounts.patch({
        name: `accounts/${flags.accountId}`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async searchChangeHistoryEvents(flags) {
      requireFlags(flags, 'accountId');
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.accounts.searchChangeHistoryEvents({
        account: `accounts/${flags.accountId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Account Summaries
  const accountSummaries = {
    async list() {
      const ga = getAnalyticsAdmin();
      const res = await ga.accountSummaries.list({});
      printJson({ok: true, data: res.data});
    },
  };

  // Properties
  const properties = {
    async list(flags) {
      requireFlags(flags, 'accountId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.list({
        filter: `parent:accounts/${flags.accountId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.get({name: `properties/${flags.propertyId}`});
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.create({requestBody: data});
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.delete({name: `properties/${flags.propertyId}`});
      printJson({ok: true, data: res.data});
    },

    async patch(flags) {
      requireFlags(flags, 'propertyId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.patch({
        name: `properties/${flags.propertyId}`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async getDataRetentionSettings(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.getDataRetentionSettings({
        name: `properties/${flags.propertyId}/dataRetentionSettings`,
      });
      printJson({ok: true, data: res.data});
    },

    async updateDataRetentionSettings(flags) {
      requireFlags(flags, 'propertyId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.updateDataRetentionSettings({
        name: `properties/${flags.propertyId}/dataRetentionSettings`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Data Streams
  const dataStreams = {
    async list(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.dataStreams.list({
        parent: `properties/${flags.propertyId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'propertyId', 'dataStreamId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.dataStreams.get({
        name: `properties/${flags.propertyId}/dataStreams/${flags.dataStreamId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'propertyId');
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.dataStreams.create({
        parent: `properties/${flags.propertyId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'propertyId', 'dataStreamId');
      const ga = getAnalyticsAdmin();
      await ga.properties.dataStreams.delete({
        name: `properties/${flags.propertyId}/dataStreams/${flags.dataStreamId}`,
      });
      printJson({ok: true, action: 'dataStreams.delete'});
    },

    async patch(flags) {
      requireFlags(flags, 'propertyId', 'dataStreamId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.dataStreams.patch({
        name: `properties/${flags.propertyId}/dataStreams/${flags.dataStreamId}`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Custom Dimensions
  const customDimensions = {
    async list(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.customDimensions.list({
        parent: `properties/${flags.propertyId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'propertyId', 'customDimensionId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.customDimensions.get({
        name: `properties/${flags.propertyId}/customDimensions/${flags.customDimensionId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'propertyId');
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.customDimensions.create({
        parent: `properties/${flags.propertyId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async patch(flags) {
      requireFlags(flags, 'propertyId', 'customDimensionId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.customDimensions.patch({
        name: `properties/${flags.propertyId}/customDimensions/${flags.customDimensionId}`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async archive(flags) {
      requireFlags(flags, 'propertyId', 'customDimensionId');
      const ga = getAnalyticsAdmin();
      await ga.properties.customDimensions.archive({
        name: `properties/${flags.propertyId}/customDimensions/${flags.customDimensionId}`,
      });
      printJson({ok: true, action: 'customDimensions.archive'});
    },
  };

  // Custom Metrics
  const customMetrics = {
    async list(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.customMetrics.list({
        parent: `properties/${flags.propertyId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'propertyId', 'customMetricId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.customMetrics.get({
        name: `properties/${flags.propertyId}/customMetrics/${flags.customMetricId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'propertyId');
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.customMetrics.create({
        parent: `properties/${flags.propertyId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async patch(flags) {
      requireFlags(flags, 'propertyId', 'customMetricId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.customMetrics.patch({
        name: `properties/${flags.propertyId}/customMetrics/${flags.customMetricId}`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async archive(flags) {
      requireFlags(flags, 'propertyId', 'customMetricId');
      const ga = getAnalyticsAdmin();
      await ga.properties.customMetrics.archive({
        name: `properties/${flags.propertyId}/customMetrics/${flags.customMetricId}`,
      });
      printJson({ok: true, action: 'customMetrics.archive'});
    },
  };

  // Key Events
  const keyEvents = {
    async list(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.keyEvents.list({
        parent: `properties/${flags.propertyId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'propertyId', 'keyEventId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.keyEvents.get({
        name: `properties/${flags.propertyId}/keyEvents/${flags.keyEventId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'propertyId');
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.keyEvents.create({
        parent: `properties/${flags.propertyId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'propertyId', 'keyEventId');
      const ga = getAnalyticsAdmin();
      await ga.properties.keyEvents.delete({
        name: `properties/${flags.propertyId}/keyEvents/${flags.keyEventId}`,
      });
      printJson({ok: true, action: 'keyEvents.delete'});
    },

    async patch(flags) {
      requireFlags(flags, 'propertyId', 'keyEventId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.keyEvents.patch({
        name: `properties/${flags.propertyId}/keyEvents/${flags.keyEventId}`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Google Ads Links
  const googleAdsLinks = {
    async list(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.googleAdsLinks.list({
        parent: `properties/${flags.propertyId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'propertyId');
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.googleAdsLinks.create({
        parent: `properties/${flags.propertyId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'propertyId', 'googleAdsLinkId');
      const ga = getAnalyticsAdmin();
      await ga.properties.googleAdsLinks.delete({
        name: `properties/${flags.propertyId}/googleAdsLinks/${flags.googleAdsLinkId}`,
      });
      printJson({ok: true, action: 'googleAdsLinks.delete'});
    },

    async patch(flags) {
      requireFlags(flags, 'propertyId', 'googleAdsLinkId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.googleAdsLinks.patch({
        name: `properties/${flags.propertyId}/googleAdsLinks/${flags.googleAdsLinkId}`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Firebase Links
  const firebaseLinks = {
    async list(flags) {
      requireFlags(flags, 'propertyId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.firebaseLinks.list({
        parent: `properties/${flags.propertyId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'propertyId');
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.firebaseLinks.create({
        parent: `properties/${flags.propertyId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'propertyId', 'firebaseLinkId');
      const ga = getAnalyticsAdmin();
      await ga.properties.firebaseLinks.delete({
        name: `properties/${flags.propertyId}/firebaseLinks/${flags.firebaseLinkId}`,
      });
      printJson({ok: true, action: 'firebaseLinks.delete'});
    },
  };

  // Measurement Protocol Secrets
  const measurementProtocolSecrets = {
    async list(flags) {
      requireFlags(flags, 'propertyId', 'dataStreamId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.dataStreams.measurementProtocolSecrets.list({
        parent: `properties/${flags.propertyId}/dataStreams/${flags.dataStreamId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'propertyId', 'dataStreamId', 'secretId');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.dataStreams.measurementProtocolSecrets.get({
        name: `properties/${flags.propertyId}/dataStreams/${flags.dataStreamId}/measurementProtocolSecrets/${flags.secretId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'propertyId', 'dataStreamId');
      const data = await parseJsonInput(flags);
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.dataStreams.measurementProtocolSecrets.create({
        parent: `properties/${flags.propertyId}/dataStreams/${flags.dataStreamId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'propertyId', 'dataStreamId', 'secretId');
      const ga = getAnalyticsAdmin();
      await ga.properties.dataStreams.measurementProtocolSecrets.delete({
        name: `properties/${flags.propertyId}/dataStreams/${flags.dataStreamId}/measurementProtocolSecrets/${flags.secretId}`,
      });
      printJson({ok: true, action: 'measurementProtocolSecrets.delete'});
    },

    async patch(flags) {
      requireFlags(flags, 'propertyId', 'dataStreamId', 'secretId');
      const data = await parseJsonInput(flags);
      const updateMask = flags.updateMask || Object.keys(data).join(',');
      const ga = getAnalyticsAdmin();
      const res = await ga.properties.dataStreams.measurementProtocolSecrets.patch({
        name: `properties/${flags.propertyId}/dataStreams/${flags.dataStreamId}/measurementProtocolSecrets/${flags.secretId}`,
        updateMask,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  return {
    accounts,
    accountSummaries,
    properties,
    dataStreams,
    customDimensions,
    customMetrics,
    keyEvents,
    googleAdsLinks,
    firebaseLinks,
    measurementProtocolSecrets,
  };
}

module.exports = {createGaApi};
