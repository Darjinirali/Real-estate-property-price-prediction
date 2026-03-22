"""
Airbnb Price Prediction - Flask API
Run: python app.py
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib, numpy as np, pandas as pd, json, os

app   = Flask(__name__)
CORS(app)

BASE  = os.path.dirname(os.path.abspath(__file__))

# ── Load model & artifacts ─────────────────────────────────────
model    = joblib.load(os.path.join(BASE, 'xgb_model.pkl'))
encoders = joblib.load(os.path.join(BASE, 'label_encoders.pkl'))

with open(os.path.join(BASE, 'feature_info.json'))  as f: feat_info = json.load(f)
with open(os.path.join(BASE, 'model_metrics.json')) as f: metrics   = json.load(f)

# ── Training stats for target encoding ────────────────────────
# These are saved from notebook — loaded at startup
CITY_MEAN  = {}  # filled from feature_info if saved
ROOM_MEAN  = {}
PROP_MEAN  = {}
CITY_MED   = {}
CITY_STD   = {}
ROOM_STD   = {}

# Try to load target encoding stats if saved
stats_path = os.path.join(BASE, 'encoding_stats.json')
if os.path.exists(stats_path):
    with open(stats_path) as f:
        stats = json.load(f)
    CITY_MEAN = stats.get('city_mean', {})
    CITY_MED  = stats.get('city_med', {})
    CITY_STD  = stats.get('city_std', {})
    ROOM_MEAN = stats.get('room_mean', {})
    ROOM_STD  = stats.get('room_std', {})
    PROP_MEAN = stats.get('prop_mean', {})
    print(f"✅ Encoding stats loaded from encoding_stats.json")

# ── Exact column config from notebook ─────────────────────────
CATEGORICAL_COLS = [
    'room_type','property_type','bed_type',
    'cancellation_policy','city','cleaning_fee',
    'instant_bookable','host_has_profile_pic','host_identity_verified'
]

CITY_COORDS = {
    'NYC':     {'lat': 40.7128, 'lon': -74.0060},
    'SF':      {'lat': 37.7749, 'lon': -122.4194},
    'LA':      {'lat': 34.0522, 'lon': -118.2437},
    'DC':      {'lat': 38.9072, 'lon': -77.0369},
    'Chicago': {'lat': 41.8781, 'lon': -87.6298},
    'Boston':  {'lat': 42.3601, 'lon': -71.0589},
}

CURRENCY_RATES = {
    "United States":  {"symbol":"$",  "code":"USD","rate":1.0},
    "United Kingdom": {"symbol":"£",  "code":"GBP","rate":0.79},
    "France":         {"symbol":"€",  "code":"EUR","rate":0.92},
    "Spain":          {"symbol":"€",  "code":"EUR","rate":0.92},
    "Australia":      {"symbol":"A$", "code":"AUD","rate":1.53},
    "Canada":         {"symbol":"C$", "code":"CAD","rate":1.36},
    "Germany":        {"symbol":"€",  "code":"EUR","rate":0.92},
    "Japan":          {"symbol":"¥",  "code":"JPY","rate":149.5},
}

print(f"✅ API ready!  R² = {metrics.get('r2', 0):.4f}")
print(f"   Features : {len(feat_info['features'])}")


# ── Feature engineering — same as notebook ────────────────────
def engineer(data: dict) -> pd.DataFrame:
    df = pd.DataFrame([data])

    # Set lat/lon from city
    city = str(data.get('city', 'NYC'))
    coords = CITY_COORDS.get(city, CITY_COORDS['NYC'])
    if 'latitude'  not in df.columns or pd.isna(df['latitude'].iloc[0]):
        df['latitude']  = coords['lat']
    if 'longitude' not in df.columns or pd.isna(df['longitude'].iloc[0]):
        df['longitude'] = coords['lon']

    # Encode categoricals
    for col in CATEGORICAL_COLS:
        if col in df.columns and col in encoders:
            le  = encoders[col]
            val = str(df[col].iloc[0])
            df[col] = le.transform([val if val in le.classes_ else le.classes_[0]])
        elif col not in df.columns:
            df[col] = 0

    # Numeric coerce
    for col in ['accommodates','bathrooms','bedrooms','beds',
                'number_of_reviews','review_scores_rating','latitude','longitude']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    def s(col, default=0):
        return float(df[col].iloc[0]) if col in df.columns else default

    accom   = s('accommodates', 2)
    beds    = s('beds', 1)
    bath    = s('bathrooms', 1)
    bedrm   = s('bedrooms', 1)
    reviews = s('number_of_reviews', 0)
    rating  = s('review_scores_rating', 90)
    lat     = s('latitude',  coords['lat'])
    lon     = s('longitude', coords['lon'])
    city_enc= s('city', 0)
    room_enc= s('room_type', 0)
    prop_enc= s('property_type', 0)

    # Ratio features
    df['beds_per_person']   = beds  / max(accom, 1)
    df['bath_per_person']   = bath  / max(accom, 1)
    df['bed_bath_ratio']    = beds  / (bath + 0.5)
    df['room_per_person']   = bedrm / max(accom, 1)
    df['price_per_person']  = accom / (bedrm + 1)
    df['beds_per_bedroom']  = beds  / (bedrm + 0.5)

    # Log transforms
    df['log_reviews']       = np.log1p(reviews)
    df['log_accommodates']  = np.log1p(accom)
    df['sqrt_accommodates'] = np.sqrt(max(accom, 0))

    # Rating flags
    df['high_rating']       = int(rating >= 95)
    df['low_rating']        = int(rating < 80)
    df['perfect_rating']    = int(rating == 100)
    df['new_listing']       = int(reviews == 0)
    df['popular_listing']   = int(reviews > 20)

    # Lat/lon features
    df['lat_lon_interact']  = lat * lon
    df['lat_rounded']       = round(lat * 10) / 10
    df['lon_rounded']       = round(lon * 10) / 10

    # Target encoding — use saved stats or fallback median
    city_key = str(int(city_enc))
    room_key = str(int(room_enc))
    prop_key = str(int(prop_enc))

    df['city_mean_price']   = float(CITY_MEAN.get(city_key, 4.5))
    df['city_median_price'] = float(CITY_MED.get(city_key, 4.5))
    df['city_std_price']    = float(CITY_STD.get(city_key, 0.5))
    df['room_mean_price']   = float(ROOM_MEAN.get(room_key, 4.5))
    df['room_std_price']    = float(ROOM_STD.get(room_key, 0.4))
    df['prop_mean_price']   = float(PROP_MEAN.get(prop_key, 4.5))

    # Interaction features
    df['city_x_room']  = city_enc * room_enc
    df['room_x_accom'] = room_enc * accom
    df['city_x_accom'] = city_enc * accom
    df['city_x_prop']  = city_enc * prop_enc

    # Amenities (if provided)
    for feat in ['has_wifi','has_ac','has_kitchen','has_tv','has_washer',
                 'has_dryer','has_parking','has_gym','has_pool','has_elevator',
                 'has_doorman','has_breakfast','has_pets','has_hottub',
                 'amenity_count','log_amenity_count','luxury_score',
                 'neighbourhood_enc','neighbourhood_mean_price',
                 'neighbourhood_std_price','zipcode_num']:
        if feat not in df.columns:
            df[feat] = 0

    return df.reindex(columns=feat_info['features'], fill_value=0).fillna(0)


# ── Routes ─────────────────────────────────────────────────────
@app.route('/health')
def health():
    return jsonify({
        'status'  : 'ok',
        'r2'      : metrics.get('r2', 0),
        'features': len(feat_info['features'])
    })


@app.route('/predict', methods=['POST'])
def predict():
    try:
        data     = request.get_json()
        if not data: return jsonify({'error': 'No input'}), 400

        duration = int(data.pop('duration_days', data.pop('duration_nights', 1)))
        country  = data.pop('country', 'United States')

        input_df      = engineer(data)
        log_pred      = float(model.predict(input_df)[0])
        per_night_usd = float(np.exp(log_pred))
        total_usd     = per_night_usd * duration
        currency      = CURRENCY_RATES.get(country, CURRENCY_RATES['United States'])

        return jsonify({
            'per_night_usd'  : round(per_night_usd, 2),
            'total_usd'      : round(total_usd, 2),
            'per_night_local': round(per_night_usd * currency['rate'], 2),
            'total_local'    : round(total_usd     * currency['rate'], 2),
            'currency'       : currency,
            'duration_days'  : duration,
            'country'        : country,
            'log_price'      : round(log_pred, 4),
            'confidence_low' : round(per_night_usd * 0.84, 2),
            'confidence_high': round(per_night_usd * 1.16, 2),
            'model_r2'       : metrics.get('r2', 0)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/config')
def config():
    return jsonify({
        'cities'  : list(CITY_COORDS.keys()),
        'metrics' : metrics,
        'features': feat_info['features'],
        'category_mappings': feat_info.get('category_mappings', {})
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
