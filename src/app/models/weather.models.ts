export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'thur', 'Fri', 'Sat'];

export interface DailyWeather {
  dt: number;
  temp: { day: number; max: number; min: number };
  weather: { description: string; icon: string }[];
}

export interface CurrentWeather {
  temp: number;
  weather: {
    description: string;
    icon: string;
  }[];
}

export interface OneCallResponse {
  current: CurrentWeather;
  daily: DailyWeather[];
}
