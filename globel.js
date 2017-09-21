

const BASE_URL = 'https://mbs.sk8tech.io';

const config = {
  base_url: BASE_URL,
  auth_url: `${BASE_URL}/wp-json/jwt-auth/v1/token`,
  rest_url: `${BASE_URL}/wp-json/wp/v2`,
  acf_url: `${BASE_URL}/wp-json/acf/v3`,
};

module.exports = { config }