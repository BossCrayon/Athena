import type { Tool } from './types.js';
import { fetchWithSecurity, type ExternalObservation } from '../core/external.js';

export const getWeatherTool: Tool = {
    definition: {
        name: 'get_weather',
        description: 'Gets current weather conditions and forecast for a specific location.',
        permission: 'safe', // Can be safe since it doesn't send out user data (just coordinates)
        schema: {
            name: 'get_weather',
            description: 'Gets current weather conditions and forecast for a specific location.',
            parameters: [
                {
                    name: 'latitude',
                    description: 'Latitude of the location.',
                    type: 'number',
                    required: true,
                },
                {
                    name: 'longitude',
                    description: 'Longitude of the location.',
                    type: 'number',
                    required: true,
                },
                {
                    name: 'location_name',
                    description: 'The name of the location (for display purposes).',
                    type: 'string',
                    required: false,
                },
            ],
        },
        isParallelizable: true
    },

    async execute(args: Record<string, unknown>) {
        const lat = args.latitude as number;
        const lon = args.longitude as number;
        const locName = args.location_name as string || `${lat}, ${lon}`;

        if (lat === undefined || lon === undefined) {
            return {
                success: false,
                output: '',
                error: 'Latitude and longitude are required.',
            };
        }

        try {
            // Fetch using Open-Meteo (No API key required)
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto`;
            
            const response = await fetchWithSecurity(url);

            if (response.status >= 400) {
                throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
            }

            const data = JSON.parse(response.text);
            
            // Map WMO Weather interpretation codes
            const weatherCodeMap: Record<number, string> = {
                0: 'Clear sky',
                1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
                45: 'Fog', 48: 'Depositing rime fog',
                51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
                61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
                71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall',
                77: 'Snow grains',
                80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
                85: 'Slight snow showers', 86: 'Heavy snow showers',
                95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
            };

            const current = data.current;
            const currentDesc = weatherCodeMap[current.weather_code] || 'Unknown';
            
            let output = `Weather for ${locName}:\n`;
            output += `Current Conditions: ${currentDesc}\n`;
            output += `Temperature: ${current.temperature_2m}°C (Feels like ${current.apparent_temperature}°C)\n`;
            output += `Humidity: ${current.relative_humidity_2m}%\n`;
            output += `Wind Speed: ${current.wind_speed_10m} km/h\n`;
            output += `Precipitation: ${current.precipitation} mm\n`;
            output += `Day/Night: ${current.is_day ? 'Day' : 'Night'}\n\n`;

            if (data.daily && data.daily.time) {
                output += `Forecast for today (${data.daily.time[0]}):\n`;
                const todayDesc = weatherCodeMap[data.daily.weather_code[0]] || 'Unknown';
                output += `Conditions: ${todayDesc}\n`;
                output += `High: ${data.daily.temperature_2m_max[0]}°C\n`;
                output += `Low: ${data.daily.temperature_2m_min[0]}°C\n`;
                output += `Max UV Index: ${data.daily.uv_index_max[0]}\n`;
            }

            const observation: ExternalObservation = {
                content: output.trim(),
                source: {
                    url,
                    domain: 'open-meteo.com',
                    retrievedAt: Date.now(),
                    sourceType: 'official' // Official weather provider for our context
                },
                freshness: 'current',
                confidence: 'high'
            };

            return {
                success: true,
                output: JSON.stringify([observation]),
            };
        } catch (error) {
            return {
                success: false,
                output: '',
                error: error instanceof Error ? error.message : 'Unknown error fetching weather.',
            };
        }
    },
};
