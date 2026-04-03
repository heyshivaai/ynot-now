'use strict';
// lib/index.js — Central exports for ynot-now shared modules

module.exports = {
  // Services
  supabase:     require('./services/supabase'),
  anthropic:    require('./services/anthropic'),
  tavily:       require('./services/tavily'),

  // Utils
  normalizers:  require('./utils/normalizers'),
  vendorFilter: require('./utils/vendor-filter'),
  urlUtils:     require('./utils/url-utils'),
  freshness:    require('./utils/freshness'),

  // Agents
  definitions:  require('./agents/definitions'),
  signals:      require('./agents/signals'),
  prompts:      require('./agents/prompts'),

  // Errors
  logger:       require('./errors/logger'),

  // Metrics
  baseline:     require('./metrics/baseline'),
  agentMetrics: require('./metrics/agent-metrics')
};
